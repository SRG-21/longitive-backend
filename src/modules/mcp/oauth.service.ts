import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { randomToken, safeEqual, sha256 } from '../../common/utils/secrets';

export const MCP_SCOPE = 'journey:read';
export const SUPPORTED_SCOPES: Record<string, string> = {
  [MCP_SCOPE]:
    'Read your journey trackers — schedule, fields, targets and logged entries — plus your body measurements and Claude reviews.',
};

const ACCESS_TOKEN_TTL_S = 60 * 60;
const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 5 * 60 * 1000;
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;
const GRANT_TYPES = ['authorization_code', 'refresh_token'];

type AuthMethod = (typeof AUTH_METHODS)[number];

/** An OAuth error response ({ error, error_description }), RFC 6749 §5.2. */
export class OAuthError extends HttpException {
  constructor(
    readonly error: string,
    readonly description: string,
    status = HttpStatus.BAD_REQUEST,
    /** Whether the error can be sent back to the client's redirect_uri (authorize endpoint only). */
    readonly redirectable = false,
  ) {
    super({ error, error_description: description }, status);
  }
}

export interface AuthorizationRequest {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

function isAllowedRedirect(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  // Native/desktop clients (e.g. Claude Code) receive the code on a loopback port.
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;
}

/**
 * A small OAuth 2.1 authorization server for the MCP connector: dynamic client registration
 * (RFC 7591), authorization code + PKCE (S256 only), rotating refresh tokens, revocation
 * (RFC 7009), and discovery metadata (RFC 8414 / RFC 9728). Users sign in and approve on the
 * web app's consent page; tokens are opaque and stored only as SHA-256 hashes.
 */
@Injectable()
export class OAuthService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** The backend's public origin — the OAuth issuer (APP_URL, e.g. https://api.example.com). */
  get issuer() {
    const url = this.config.get<string>('APP_URL');
    if (!url) throw new InternalServerErrorException('APP_URL is not configured');
    return url.replace(/\/+$/, '');
  }

  /** The MCP endpoint: the protected resource tokens are issued for. */
  get resource() {
    return `${this.issuer}/api/v1/mcp`;
  }

  get protectedResourceMetadataUrl() {
    return `${this.issuer}/.well-known/oauth-protected-resource/api/v1/mcp`;
  }

  protectedResourceMetadata() {
    return {
      resource: this.resource,
      authorization_servers: [this.issuer],
      scopes_supported: Object.keys(SUPPORTED_SCOPES),
      bearer_methods_supported: ['header'],
      resource_name: 'Longevity — journey trackers',
    };
  }

  authorizationServerMetadata() {
    const api = `${this.issuer}/api/v1/oauth`;
    return {
      issuer: this.issuer,
      authorization_endpoint: `${api}/authorize`,
      token_endpoint: `${api}/token`,
      registration_endpoint: `${api}/register`,
      revocation_endpoint: `${api}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: GRANT_TYPES,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [...AUTH_METHODS],
      revocation_endpoint_auth_methods_supported: [...AUTH_METHODS],
      scopes_supported: Object.keys(SUPPORTED_SCOPES),
      authorization_response_iss_parameter_supported: true,
    };
  }

  // ---------- dynamic client registration ----------

  async registerClient(body: Record<string, unknown>) {
    const redirectUris = asStringArray(body.redirect_uris);
    if (!redirectUris?.length) {
      throw new OAuthError(
        'invalid_redirect_uri',
        'redirect_uris must be a non-empty array of URLs',
      );
    }
    const bad = redirectUris.find((u) => !isAllowedRedirect(u));
    if (bad) {
      throw new OAuthError(
        'invalid_redirect_uri',
        `Redirect URI not allowed (https, or http on localhost): ${bad}`,
      );
    }

    // RFC 7591 §2: the default token endpoint auth method is client_secret_basic.
    const method = (body.token_endpoint_auth_method ?? 'client_secret_basic') as AuthMethod;
    if (!AUTH_METHODS.includes(method)) {
      throw new OAuthError(
        'invalid_client_metadata',
        `Unsupported token_endpoint_auth_method: ${String(method)}`,
      );
    }
    const grantTypes = asStringArray(body.grant_types) ?? ['authorization_code'];
    if (grantTypes.some((g) => !GRANT_TYPES.includes(g))) {
      throw new OAuthError(
        'invalid_client_metadata',
        'Only authorization_code and refresh_token grants are supported',
      );
    }
    const responseTypes = asStringArray(body.response_types) ?? ['code'];
    if (responseTypes.some((r) => r !== 'code')) {
      throw new OAuthError('invalid_client_metadata', 'Only the "code" response type is supported');
    }
    const clientName =
      typeof body.client_name === 'string' && body.client_name.trim()
        ? body.client_name.trim().slice(0, 100)
        : 'MCP client';

    const clientId = randomToken(16);
    const clientSecret = method === 'none' ? null : randomToken(32);
    const client = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash: clientSecret ? sha256(clientSecret) : null,
        clientName,
        redirectUris,
        tokenEndpointAuthMethod: method,
      },
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      ...(clientSecret && { client_secret: clientSecret, client_secret_expires_at: 0 }),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: grantTypes,
      response_types: ['code'],
      token_endpoint_auth_method: method,
    };
  }

  // ---------- authorization ----------

  /** Checks an authorization request. Errors marked redirectable go back to the client. */
  async validateAuthorization(req: AuthorizationRequest) {
    const client = req.client_id
      ? await this.prisma.oAuthClient.findUnique({ where: { clientId: req.client_id } })
      : null;
    if (!client) throw new OAuthError('invalid_client', 'Unknown client_id');
    if (!req.redirect_uri || !client.redirectUris.includes(req.redirect_uri)) {
      // Never redirect to an unregistered URI.
      throw new OAuthError(
        'invalid_request',
        'redirect_uri does not match a registered redirect URI',
      );
    }
    if (req.response_type !== 'code') {
      throw new OAuthError('unsupported_response_type', 'response_type must be "code"', 400, true);
    }
    if (!req.code_challenge || req.code_challenge_method !== 'S256') {
      throw new OAuthError(
        'invalid_request',
        'PKCE with code_challenge_method=S256 is required',
        400,
        true,
      );
    }
    const scopes = (req.scope?.trim() || MCP_SCOPE).split(/\s+/);
    const unknown = scopes.find((s) => !(s in SUPPORTED_SCOPES));
    if (unknown) throw new OAuthError('invalid_scope', `Unknown scope: ${unknown}`, 400, true);
    if (req.resource && req.resource !== this.resource) {
      throw new OAuthError(
        'invalid_target',
        `Tokens can only be issued for ${this.resource}`,
        400,
        true,
      );
    }
    return { client, scope: scopes.join(' ') };
  }

  /** An error response on the client's redirect URI (RFC 6749 §4.1.2.1). */
  errorRedirect(req: AuthorizationRequest, error: OAuthError) {
    const url = new URL(req.redirect_uri!);
    url.searchParams.set('error', error.error);
    url.searchParams.set('error_description', error.description);
    if (req.state) url.searchParams.set('state', req.state);
    url.searchParams.set('iss', this.issuer);
    return url.toString();
  }

  /** What the consent page shows. */
  async describeAuthorization(req: AuthorizationRequest) {
    const { client, scope } = await this.validateAuthorization(req);
    return {
      clientName: client.clientName,
      redirectHost: new URL(req.redirect_uri!).host,
      scopes: scope.split(' ').map((s) => ({ scope: s, description: SUPPORTED_SCOPES[s] })),
    };
  }

  /** The signed-in user approved or denied: returns where to send the browser next. */
  async decide(userId: string, tenantId: string, req: AuthorizationRequest, approve: boolean) {
    const { scope } = await this.validateAuthorization(req);
    if (!approve) {
      return {
        redirectTo: this.errorRedirect(
          req,
          new OAuthError('access_denied', 'The user denied access'),
        ),
      };
    }
    const code = randomToken(32);
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: sha256(code),
        clientId: req.client_id!,
        userId,
        tenantId,
        redirectUri: req.redirect_uri!,
        codeChallenge: req.code_challenge!,
        scope,
        resource: req.resource || null,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        // Written as explicit nulls: on MongoDB a `field: null` filter (used to claim the code
        // once, and to find live grants) doesn't match a field that was never written.
        usedAt: null,
      },
    });
    const url = new URL(req.redirect_uri!);
    url.searchParams.set('code', code);
    if (req.state) url.searchParams.set('state', req.state);
    url.searchParams.set('iss', this.issuer);
    return { redirectTo: url.toString() };
  }

  // ---------- token endpoint ----------

  private async authenticateClient(body: Record<string, unknown>, authorization?: string) {
    let clientId = typeof body.client_id === 'string' ? body.client_id : undefined;
    let secret = typeof body.client_secret === 'string' ? body.client_secret : undefined;
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep > 0) {
        clientId = decodeURIComponent(decoded.slice(0, sep));
        secret = decodeURIComponent(decoded.slice(sep + 1));
      }
    }
    const client = clientId
      ? await this.prisma.oAuthClient.findUnique({ where: { clientId } })
      : null;
    if (!client) throw new OAuthError('invalid_client', 'Unknown client', HttpStatus.UNAUTHORIZED);
    if (client.tokenEndpointAuthMethod !== 'none') {
      if (
        !secret ||
        !client.clientSecretHash ||
        !safeEqual(sha256(secret), client.clientSecretHash)
      ) {
        throw new OAuthError(
          'invalid_client',
          'Client authentication failed',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }
    return client;
  }

  async token(body: Record<string, unknown>, authorization?: string) {
    const client = await this.authenticateClient(body, authorization);
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);

    if (body.grant_type === 'authorization_code') {
      const code = str('code');
      const verifier = str('code_verifier');
      const redirectUri = str('redirect_uri');
      if (!code || !verifier || !redirectUri) {
        throw new OAuthError(
          'invalid_request',
          'code, code_verifier and redirect_uri are required',
        );
      }
      const record = await this.prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash: sha256(code) },
      });
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const resource = str('resource');
      if (
        !record ||
        record.usedAt ||
        record.expiresAt < new Date() ||
        record.clientId !== client.clientId ||
        record.redirectUri !== redirectUri ||
        !safeEqual(challenge, record.codeChallenge) ||
        (resource && resource !== (record.resource ?? this.resource))
      ) {
        throw new OAuthError(
          'invalid_grant',
          'The authorization code is invalid, expired or already used',
        );
      }
      // Single use, even under concurrent redemption.
      const claimed = await this.prisma.oAuthAuthorizationCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new OAuthError('invalid_grant', 'The authorization code was already used');

      const tokens = this.newTokens();
      await this.prisma.oAuthGrant.create({
        data: {
          userId: record.userId,
          tenantId: record.tenantId,
          clientId: client.clientId,
          clientName: client.clientName,
          scope: record.scope,
          resource: record.resource ?? this.resource,
          ...tokens.stored,
          lastUsedAt: null,
          revokedAt: null,
        },
      });
      return tokens.response(record.scope);
    }

    if (body.grant_type === 'refresh_token') {
      const refreshToken = str('refresh_token');
      if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required');
      const grant = await this.prisma.oAuthGrant.findUnique({
        where: { refreshTokenHash: sha256(refreshToken) },
      });
      if (
        !grant ||
        grant.revokedAt ||
        grant.refreshExpiresAt < new Date() ||
        grant.clientId !== client.clientId
      ) {
        throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired or revoked');
      }
      // Rotate: the old refresh token stops working as soon as the new pair is issued.
      const tokens = this.newTokens();
      await this.prisma.oAuthGrant.update({ where: { id: grant.id }, data: tokens.stored });
      return tokens.response(grant.scope);
    }

    throw new OAuthError(
      'unsupported_grant_type',
      'grant_type must be authorization_code or refresh_token',
    );
  }

  private newTokens() {
    const accessToken = randomToken(32);
    const refreshToken = randomToken(32);
    const now = Date.now();
    return {
      stored: {
        accessTokenHash: sha256(accessToken),
        accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_S * 1000),
        refreshTokenHash: sha256(refreshToken),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_S * 1000),
      },
      response: (scope: string) => ({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_S,
        refresh_token: refreshToken,
        scope,
      }),
    };
  }

  /** RFC 7009: always succeeds, whether or not the token was known. */
  async revoke(body: Record<string, unknown>, authorization?: string) {
    const client = await this.authenticateClient(body, authorization);
    const token = typeof body.token === 'string' ? sha256(body.token) : null;
    if (token) {
      await this.prisma.oAuthGrant.updateMany({
        where: {
          clientId: client.clientId,
          revokedAt: null,
          OR: [{ accessTokenHash: token }, { refreshTokenHash: token }],
        },
        data: { revokedAt: new Date() },
      });
    }
    return {};
  }

  // ---------- resource server ----------

  /** The grant behind a bearer token, or null if the token is unknown, expired or revoked. */
  async verifyAccessToken(token: string) {
    const grant = await this.prisma.oAuthGrant.findUnique({
      where: { accessTokenHash: sha256(token) },
    });
    if (!grant || grant.revokedAt || grant.accessExpiresAt < new Date()) return null;
    if (grant.resource && grant.resource !== this.resource) return null; // issued for another audience
    if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await this.prisma.oAuthGrant.update({
        where: { id: grant.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return grant;
  }

  // ---------- the user's connected apps ----------

  async listGrants(userId: string) {
    const grants = await this.prisma.oAuthGrant.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return grants
      .filter((g) => g.refreshExpiresAt > new Date())
      .map((g) => ({
        id: g.id,
        clientName: g.clientName,
        scope: g.scope,
        connectedAt: g.createdAt,
        lastUsedAt: g.lastUsedAt,
      }));
  }

  async revokeGrant(userId: string, id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) return { revoked: false };
    await this.prisma.oAuthGrant.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }
}

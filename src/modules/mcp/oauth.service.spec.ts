import { createHash } from 'crypto';
import { OAuthError, OAuthService } from './oauth.service';

/** A tiny in-memory stand-in for the three OAuth collections. */
function fakePrisma() {
  const tables: Record<string, any[]> = { clients: [], codes: [], grants: [] };
  let seq = 0;
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === 'OR') return (v as any[]).some((w) => matches(row, w));
      // MongoDB semantics: `null` matches a field stored as null, not one that was never written.
      if (v === null) return row[k] === null;
      return row[k] === v;
    });
  const table = (name: string) => ({
    create: jest.fn(async ({ data }) => {
      const row = { id: String(++seq).padStart(24, '0'), createdAt: new Date(), ...data };
      tables[name].push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }) => tables[name].find((r) => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where }) => tables[name].filter((r) => matches(r, where))),
    update: jest.fn(async ({ where, data }) =>
      Object.assign(
        tables[name].find((r) => matches(r, where)),
        data,
      ),
    ),
    updateMany: jest.fn(async ({ where, data }) => {
      const rows = tables[name].filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    }),
  });
  return {
    tables,
    prisma: {
      oAuthClient: table('clients'),
      oAuthAuthorizationCode: table('codes'),
      oAuthGrant: table('grants'),
    },
  };
}

const s256 = (v: string) => createHash('sha256').update(v).digest('base64url');

describe('OAuthService', () => {
  const VERIFIER = 'a'.repeat(50);
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
  let db: ReturnType<typeof fakePrisma>;
  let oauth: OAuthService;

  beforeEach(() => {
    db = fakePrisma();
    const config: any = { get: (k: string) => ({ APP_URL: 'https://api.example.com/' })[k] };
    oauth = new OAuthService(db.prisma as any, config);
  });

  const register = (extra: Record<string, unknown> = {}) =>
    oauth.registerClient({
      client_name: 'Claude',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
      ...extra,
    });

  const authorize = async (clientId: string, overrides: Record<string, string> = {}) => {
    const { redirectTo } = await oauth.decide(
      'user-1',
      'tenant-1',
      {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: s256(VERIFIER),
        code_challenge_method: 'S256',
        state: 'xyz',
        resource: 'https://api.example.com/api/v1/mcp',
        ...overrides,
      },
      true,
    );
    const url = new URL(redirectTo);
    return { code: url.searchParams.get('code')!, url };
  };

  it('publishes discovery metadata that points at itself', () => {
    expect(oauth.protectedResourceMetadata()).toMatchObject({
      resource: 'https://api.example.com/api/v1/mcp',
      authorization_servers: ['https://api.example.com'],
    });
    expect(oauth.authorizationServerMetadata()).toMatchObject({
      issuer: 'https://api.example.com',
      token_endpoint: 'https://api.example.com/api/v1/oauth/token',
      code_challenge_methods_supported: ['S256'],
    });
  });

  describe('registration', () => {
    it('registers a public client without a secret', async () => {
      const client = await register();
      expect(client.client_id).toBeTruthy();
      expect((client as any).client_secret).toBeUndefined();
    });

    it('issues a secret to confidential clients and stores only its hash', async () => {
      const client: any = await register({ token_endpoint_auth_method: 'client_secret_post' });
      expect(client.client_secret).toBeTruthy();
      expect(db.tables.clients[0].clientSecretHash).not.toContain(client.client_secret);
    });

    it.each([
      ['http://evil.example.com/cb'],
      ['javascript:alert(1)'],
      ['https://ok.example.com/cb#frag'],
    ])('rejects redirect URI %s', async (uri) => {
      await expect(register({ redirect_uris: [uri] })).rejects.toMatchObject({
        error: 'invalid_redirect_uri',
      });
    });

    it('allows loopback http redirects for desktop clients', async () => {
      await expect(
        register({ redirect_uris: ['http://localhost:33418/callback'] }),
      ).resolves.toBeTruthy();
    });
  });

  describe('authorization', () => {
    it('never redirects to an unregistered redirect URI', async () => {
      const { client_id } = await register();
      const err = await oauth
        .validateAuthorization({
          client_id,
          redirect_uri: 'https://attacker.example.com/cb',
          response_type: 'code',
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(OAuthError);
      expect(err.redirectable).toBe(false);
    });

    it('requires PKCE S256', async () => {
      const { client_id } = await register();
      await expect(
        oauth.validateAuthorization({
          client_id,
          redirect_uri: REDIRECT,
          response_type: 'code',
          code_challenge: 'x',
          code_challenge_method: 'plain',
        }),
      ).rejects.toMatchObject({ error: 'invalid_request', redirectable: true });
    });

    it('refuses tokens for another resource', async () => {
      const { client_id } = await register();
      await expect(
        oauth.validateAuthorization({
          client_id,
          redirect_uri: REDIRECT,
          response_type: 'code',
          code_challenge: s256(VERIFIER),
          code_challenge_method: 'S256',
          resource: 'https://other.example.com/mcp',
        }),
      ).rejects.toMatchObject({ error: 'invalid_target' });
    });

    it('sends a denial back to the client with the state', async () => {
      const { client_id } = await register();
      const { redirectTo } = await oauth.decide(
        'u',
        't',
        {
          response_type: 'code',
          client_id,
          redirect_uri: REDIRECT,
          code_challenge: s256(VERIFIER),
          code_challenge_method: 'S256',
          state: 's1',
        },
        false,
      );
      const url = new URL(redirectTo);
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('state')).toBe('s1');
    });
  });

  describe('token exchange', () => {
    it('exchanges a code once, with the right verifier, for tokens bound to the user', async () => {
      const { client_id } = await register();
      const { code, url } = await authorize(client_id);
      expect(url.searchParams.get('state')).toBe('xyz');
      expect(url.searchParams.get('iss')).toBe('https://api.example.com');

      const tokens = await oauth.token({
        grant_type: 'authorization_code',
        client_id,
        code,
        code_verifier: VERIFIER,
        redirect_uri: REDIRECT,
      });
      expect(tokens).toMatchObject({
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'journey:read',
      });
      const grant = await oauth.verifyAccessToken(tokens.access_token);
      expect(grant).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1', clientName: 'Claude' });

      await expect(
        oauth.token({
          grant_type: 'authorization_code',
          client_id,
          code,
          code_verifier: VERIFIER,
          redirect_uri: REDIRECT,
        }),
      ).rejects.toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects a wrong PKCE verifier', async () => {
      const { client_id } = await register();
      const { code } = await authorize(client_id);
      await expect(
        oauth.token({
          grant_type: 'authorization_code',
          client_id,
          code,
          code_verifier: 'b'.repeat(50),
          redirect_uri: REDIRECT,
        }),
      ).rejects.toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects a code redeemed by a different client or redirect URI', async () => {
      const a = await register();
      const b = await register();
      const { code } = await authorize(a.client_id);
      await expect(
        oauth.token({
          grant_type: 'authorization_code',
          client_id: b.client_id,
          code,
          code_verifier: VERIFIER,
          redirect_uri: REDIRECT,
        }),
      ).rejects.toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects an expired code', async () => {
      const { client_id } = await register();
      const { code } = await authorize(client_id);
      db.tables.codes[0].expiresAt = new Date(Date.now() - 1000);
      await expect(
        oauth.token({
          grant_type: 'authorization_code',
          client_id,
          code,
          code_verifier: VERIFIER,
          redirect_uri: REDIRECT,
        }),
      ).rejects.toMatchObject({ error: 'invalid_grant' });
    });

    it('authenticates confidential clients with HTTP Basic', async () => {
      const client: any = await register({ token_endpoint_auth_method: 'client_secret_basic' });
      const { code } = await authorize(client.client_id);
      const basic = (secret: string) =>
        `Basic ${Buffer.from(`${client.client_id}:${secret}`).toString('base64')}`;
      const body = {
        grant_type: 'authorization_code',
        code,
        code_verifier: VERIFIER,
        redirect_uri: REDIRECT,
      };
      await expect(oauth.token(body, basic('wrong'))).rejects.toMatchObject({
        error: 'invalid_client',
      });
      await expect(oauth.token(body, basic(client.client_secret))).resolves.toMatchObject({
        token_type: 'Bearer',
      });
    });

    it('rotates refresh tokens and retires the old pair', async () => {
      const { client_id } = await register();
      const { code } = await authorize(client_id);
      const first = await oauth.token({
        grant_type: 'authorization_code',
        client_id,
        code,
        code_verifier: VERIFIER,
        redirect_uri: REDIRECT,
      });
      const second = await oauth.token({
        grant_type: 'refresh_token',
        client_id,
        refresh_token: first.refresh_token,
      });
      expect(second.access_token).not.toBe(first.access_token);
      expect(await oauth.verifyAccessToken(first.access_token)).toBeNull();
      expect(await oauth.verifyAccessToken(second.access_token)).not.toBeNull();
      await expect(
        oauth.token({ grant_type: 'refresh_token', client_id, refresh_token: first.refresh_token }),
      ).rejects.toMatchObject({
        error: 'invalid_grant',
      });
    });
  });

  describe('revocation and access', () => {
    it('stops a revoked or expired token from working', async () => {
      const { client_id } = await register();
      const { code } = await authorize(client_id);
      const tokens = await oauth.token({
        grant_type: 'authorization_code',
        client_id,
        code,
        code_verifier: VERIFIER,
        redirect_uri: REDIRECT,
      });

      db.tables.grants[0].accessExpiresAt = new Date(Date.now() - 1000);
      expect(await oauth.verifyAccessToken(tokens.access_token)).toBeNull();
      db.tables.grants[0].accessExpiresAt = new Date(Date.now() + 60_000);

      await oauth.revoke({ client_id, token: tokens.refresh_token });
      expect(await oauth.verifyAccessToken(tokens.access_token)).toBeNull();
    });

    it('lets a user disconnect only their own apps', async () => {
      const { client_id } = await register();
      const { code } = await authorize(client_id);
      await oauth.token({
        grant_type: 'authorization_code',
        client_id,
        code,
        code_verifier: VERIFIER,
        redirect_uri: REDIRECT,
      });
      const [grant] = await oauth.listGrants('user-1');
      await oauth.revokeGrant('someone-else', grant.id);
      expect(await oauth.listGrants('user-1')).toHaveLength(1);
      await oauth.revokeGrant('user-1', grant.id);
      expect(await oauth.listGrants('user-1')).toHaveLength(0);
    });
  });
});

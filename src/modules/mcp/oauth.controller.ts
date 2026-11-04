import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { AuthorizationRequest, OAuthError, OAuthService } from './oauth.service';

function pickAuthorizationRequest(source: Record<string, unknown>): AuthorizationRequest {
  const keys = [
    'response_type',
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
    'scope',
    'state',
    'resource',
  ] as const;
  return Object.fromEntries(
    keys.filter((k) => typeof source[k] === 'string').map((k) => [k, source[k] as string]),
  ) as AuthorizationRequest;
}

/**
 * OAuth endpoints for the MCP connector. Request bodies are plain objects (not DTOs): OAuth
 * clients send fields this API doesn't know about, and the global whitelist validation would
 * reject them. Each endpoint validates what it reads instead.
 */
@ApiTags('OAuth (MCP connector)')
@Controller('oauth')
export class OAuthController {
  constructor(
    private oauth: OAuthService,
    private config: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  register(@Body() body: Record<string, unknown>) {
    return this.oauth.registerClient(body ?? {});
  }

  /** Validates the request, then hands the browser to the web app's sign-in + consent page. */
  @Get('authorize')
  @ApiExcludeEndpoint()
  async authorize(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const req = pickAuthorizationRequest(query);
    try {
      await this.oauth.validateAuthorization(req);
    } catch (err) {
      if (err instanceof OAuthError && err.redirectable)
        return res.redirect(302, this.oauth.errorRedirect(req, err));
      if (err instanceof OAuthError) {
        // Unknown client or unregistered redirect URI: show the error, never redirect.
        return res
          .status(400)
          .type('text/plain')
          .send(`Authorization request rejected: ${err.description}`);
      }
      throw err;
    }
    const frontend = this.config.get<string>('FRONTEND_URL')?.replace(/\/+$/, '');
    if (!frontend) return res.status(500).type('text/plain').send('FRONTEND_URL is not configured');
    const consent = new URL(`${frontend}/oauth/consent`);
    for (const [k, v] of Object.entries(req)) consent.searchParams.set(k, v);
    return res.redirect(302, consent.toString());
  }

  /** For the consent page: who is asking, and for what. */
  @Get('authorize/info')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  info(@Query() query: Record<string, unknown>) {
    return this.oauth.describeAuthorization(pickAuthorizationRequest(query));
  }

  /** The signed-in user's answer on the consent page. */
  @Post('authorize/decision')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  decide(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.oauth.decide(
      userId,
      tenantId,
      pickAuthorizationRequest(body ?? {}),
      body?.approve === true,
    );
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiExcludeEndpoint()
  token(@Body() body: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    return this.oauth.token(body ?? {}, authorization);
  }

  @Post('revoke')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  revoke(@Body() body: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    return this.oauth.revoke(body ?? {}, authorization);
  }

  /** Apps the signed-in user has connected (for Settings). */
  @Get('grants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  grants(@CurrentUser('id') userId: string) {
    return this.oauth.listGrants(userId);
  }

  @Delete('grants/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  revokeGrant(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.oauth.revokeGrant(userId, id);
  }
}

/** Discovery documents. Served at the site root (excluded from the /api/v1 prefix in bootstrap). */
@Controller('.well-known')
export class WellKnownController {
  constructor(private oauth: OAuthService) {}

  // RFC 9728: clients try the path-suffixed form for a resource with a path, then the root.
  @Get('oauth-protected-resource/api/v1/mcp')
  @ApiExcludeEndpoint()
  protectedResourceForMcp() {
    return this.oauth.protectedResourceMetadata();
  }

  @Get('oauth-protected-resource')
  @ApiExcludeEndpoint()
  protectedResource() {
    return this.oauth.protectedResourceMetadata();
  }

  // RFC 8414, plus the OpenID path some clients probe first.
  @Get('oauth-authorization-server')
  @ApiExcludeEndpoint()
  authorizationServer() {
    return this.oauth.authorizationServerMetadata();
  }

  @Get('openid-configuration')
  @ApiExcludeEndpoint()
  openidConfiguration() {
    return this.oauth.authorizationServerMetadata();
  }
}

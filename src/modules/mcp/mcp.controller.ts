import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { tenantContext } from '../../common/context/tenant-context';
import { JourneyMcpServerFactory } from './journey-mcp.server';
import { OAuthService } from './oauth.service';

/**
 * The MCP endpoint (Streamable HTTP, stateless: every POST is self-contained, which suits
 * serverless). Requests need an OAuth access token from this backend's authorization server;
 * without one the response points the client at the discovery metadata so it can sign in.
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(
    private oauth: OAuthService,
    private servers: JourneyMcpServerFactory,
  ) {}

  private async authenticate(req: Request, res: Response) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const grant = token ? await this.oauth.verifyAccessToken(token) : null;
    if (grant && token) return { grant, token };

    const challenge = [`Bearer resource_metadata="${this.oauth.protectedResourceMetadataUrl}"`];
    if (token)
      challenge.push(
        'error="invalid_token"',
        'error_description="The access token is invalid or expired"',
      );
    res
      .status(401)
      .setHeader('WWW-Authenticate', challenge.join(', '))
      .json({
        error: token ? 'invalid_token' : 'unauthorized',
        error_description: 'Sign in to connect your Longevity data',
      });
    return null;
  }

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const auth = await this.authenticate(req, res);
    if (!auth) return;
    const { grant, token } = auth;

    // Run as the token's user: tenant scoping applies exactly as for a signed-in web request.
    await tenantContext.run({ tenantId: grant.tenantId }, async () => {
      const server = this.servers.create(grant.userId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      const withAuth = Object.assign(req, {
        auth: {
          token,
          clientId: grant.clientId,
          scopes: grant.scope.split(' '),
          expiresAt: Math.floor(grant.accessExpiresAt.getTime() / 1000),
        },
      });
      await transport.handleRequest(withAuth, res, req.body);
    });
  }

  // Stateless server: no standalone SSE stream and no sessions to end.
  @Get()
  async stream(@Req() req: Request, @Res() res: Response) {
    if (!(await this.authenticate(req, res))) return;
    this.methodNotAllowed(res);
  }

  @Delete()
  async end(@Req() req: Request, @Res() res: Response) {
    if (!(await this.authenticate(req, res))) return;
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response) {
    res
      .status(405)
      .setHeader('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  }
}

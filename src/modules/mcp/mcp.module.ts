import { Module } from '@nestjs/common';
import { JourneyTrackerModule } from '../journey-tracker/journey-tracker.module';
import { JourneyMcpServerFactory } from './journey-mcp.server';
import { McpController } from './mcp.controller';
import { OAuthController, WellKnownController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/** MCP server for Claude (and other MCP clients), with its own OAuth authorization server. */
@Module({
  imports: [JourneyTrackerModule],
  controllers: [McpController, OAuthController, WellKnownController],
  providers: [OAuthService, JourneyMcpServerFactory],
})
export class McpModule {}

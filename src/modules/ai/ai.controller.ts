import { Controller, Post, Get, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { InsightsService } from './insights.service';
import { FirstAidService } from './first-aid.service';
import { AiService } from './ai.service';
import { ChatMessageDto, GenerateInsightsDto, FirstAidDto, WhatIfDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';
import { WHAT_IF_PROMPT } from './prompt-templates';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private chatService: ChatService,
    private insightsService: InsightsService,
    private firstAidService: FirstAidService,
    private aiService: AiService,
  ) {}

  @Post('chat')
  chat(@CurrentUser('id') userId: string, @Body() dto: ChatMessageDto) {
    return this.chatService.sendMessage(userId, dto.message, dto.sessionId);
  }

  @Get('chat/sessions')
  getSessions(@CurrentUser('id') userId: string) {
    return this.chatService.getSessions(userId);
  }

  @Get('chat/sessions/:id')
  getSession(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.chatService.getSession(userId, id);
  }

  @Post('chat/sessions/:id/summarize')
  summarize(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.chatService.summarizeSession(userId, id);
  }

  @Post('insights/generate')
  generateInsights(@CurrentUser('id') userId: string) {
    return this.insightsService.generateInsights(userId);
  }

  @Get('insights')
  getInsights(@CurrentUser('id') userId: string) {
    return this.insightsService.getInsights(userId);
  }

  @Post('insights/:id/pin')
  pinInsight(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.insightsService.pinInsight(userId, id);
  }

  @Post('first-aid')
  firstAid(@CurrentUser('id') userId: string, @Body() dto: FirstAidDto) {
    return this.firstAidService.processIncident(userId, dto.description);
  }

  @Get('first-aid/history')
  firstAidHistory(@CurrentUser('id') userId: string) {
    return this.firstAidService.getHistory(userId);
  }

  @Post('what-if')
  async whatIf(@CurrentUser('id') userId: string, @Body() dto: WhatIfDto) {
    const prompt = WHAT_IF_PROMPT.replace('{{scenario}}', dto.scenario).replace('{{context}}', '');
    const response = await this.aiService.generateCompletion(
      'You are a predictive health analyst.',
      prompt,
    );
    return { scenario: dto.scenario, analysis: response };
  }

  @Get('biological-age')
  biologicalAge(@CurrentUser('id') userId: string) {
    return this.insightsService.getBiologicalAge(userId);
  }
}

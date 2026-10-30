import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChatService } from './chat.service';
import { InsightsService } from './insights.service';
import { FirstAidService } from './first-aid.service';

@Module({
  controllers: [AiController],
  providers: [AiService, ChatService, InsightsService, FirstAidService],
  exports: [AiService, ChatService, InsightsService],
})
export class AiModule {}

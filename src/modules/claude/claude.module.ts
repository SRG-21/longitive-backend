import { Module } from '@nestjs/common';
import { JourneyTrackerModule } from '../journey-tracker/journey-tracker.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ClaudeService } from './claude.service';
import { JourneyReviewController, JourneyReviewCronController } from './journey-review.controller';
import { JourneyReviewScheduler } from './journey-review.scheduler';
import { JourneyReviewService } from './journey-review.service';

/** Claude (Anthropic API) features. Independent of the OpenAI-based `ai` module. */
@Module({
  imports: [JourneyTrackerModule, TelegramModule],
  controllers: [JourneyReviewController, JourneyReviewCronController],
  providers: [ClaudeService, JourneyReviewService, JourneyReviewScheduler],
  exports: [ClaudeService, JourneyReviewService],
})
export class ClaudeModule {}

import { Module } from '@nestjs/common';
import { JourneyTrackerModule } from '../journey-tracker/journey-tracker.module';
import { TelegramAlertsService } from './telegram-alerts.service';
import { TelegramController } from './telegram.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramScheduler } from './telegram.scheduler';
import { TelegramService } from './telegram.service';

@Module({
  imports: [JourneyTrackerModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramLinkService, TelegramAlertsService, TelegramScheduler],
  exports: [TelegramService],
})
export class TelegramModule {}

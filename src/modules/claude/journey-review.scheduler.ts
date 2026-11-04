import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DEFAULT_REMINDER_TIMEZONE } from '../telegram/telegram-schedule';
import { JourneyReviewService } from './journey-review.service';

const timeZone = process.env.REMINDER_TIMEZONE || DEFAULT_REMINDER_TIMEZONE;

/** In-process schedule for pro mode; on Vercel (eco mode) vercel.json's cron calls the endpoint. */
@Injectable()
export class JourneyReviewScheduler {
  private readonly logger = new Logger(JourneyReviewScheduler.name);

  constructor(private reviews: JourneyReviewService) {}

  // 23:45, after the day's last check-ins (18:15 UTC in vercel.json).
  @Cron('0 45 23 * * *', { name: 'claude-weekly-reviews', timeZone })
  async weekly() {
    if (process.env.APP_MODE !== 'pro') return;
    await this.reviews.runScheduled().catch((err) => this.logger.error(err));
  }
}

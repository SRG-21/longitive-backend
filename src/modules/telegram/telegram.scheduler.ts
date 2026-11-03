import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramAlertsService } from './telegram-alerts.service';
import { DEFAULT_REMINDER_TIMEZONE } from './telegram-schedule';

const timeZone = process.env.REMINDER_TIMEZONE || DEFAULT_REMINDER_TIMEZONE;

/**
 * In-process schedule for pro mode (a long-running server). In eco mode the app runs as a
 * Vercel function that sleeps between requests, so Vercel Cron calls the /telegram/cron/*
 * endpoints instead (see vercel.json) and these handlers stand down to avoid double sends.
 */
@Injectable()
export class TelegramScheduler {
  private readonly logger = new Logger(TelegramScheduler.name);

  constructor(private alerts: TelegramAlertsService) {}

  private get enabled() {
    return process.env.APP_MODE === 'pro';
  }

  // 15:00 — see DAILY_REMINDER_TIME
  @Cron('0 0 15 * * *', { name: 'telegram-daily-reminder', timeZone })
  async dailyReminder() {
    if (this.enabled) await this.alerts.run('daily').catch((err) => this.logger.error(err));
  }

  // 23:30 — see MISSED_DAY_ALERT_TIME
  @Cron('0 30 23 * * *', { name: 'telegram-missed-day', timeZone })
  async missedDay() {
    if (this.enabled) await this.alerts.run('missed').catch((err) => this.logger.error(err));
  }
}

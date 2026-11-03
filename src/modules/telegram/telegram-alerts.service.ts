import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackerEntryService } from '../journey-tracker/tracker-entry.service';
import { escapeHtml, MessageButton, TelegramApiError, TelegramService } from './telegram.service';
import { AlertKind, alertDay, DEFAULT_REMINDER_TIMEZONE } from './telegram-schedule';

export interface PendingTracker {
  id: string;
  name: string;
  dayNumber: number;
  totalDays: number | null;
  /** Earlier days (before the alert's day) that were also not logged. */
  earlierMissed: number;
}

export interface AlertRunResult {
  kind: AlertKind;
  day: string;
  timeZone: string;
  linkedUsers: number;
  sent: number;
  /** Everything logged, or the alert turned off. */
  skipped: number;
  /** Already sent for this day by an earlier run. */
  duplicates: number;
  failed: number;
}

function shortDate(day: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

function progress(t: PendingTracker) {
  return t.totalDays ? `day ${t.dayNumber} of ${t.totalDays}` : `day ${t.dayNumber}`;
}

/** The message text and buttons for one user's alert. Pure, so it is easy to test. */
export function buildAlertMessage(
  kind: AlertKind,
  day: string,
  trackers: PendingTracker[],
  appUrl: string | null,
): { html: string; buttons: MessageButton[] } {
  const date = shortDate(day);
  const lines = trackers.map((t) => {
    const earlier =
      kind === 'missed' && t.earlierMissed
        ? ` · ${t.earlierMissed} earlier ${t.earlierMissed === 1 ? 'day' : 'days'} to fill in too`
        : '';
    return `• <b>${escapeHtml(t.name)}</b> · ${progress(t)}${earlier}`;
  });

  const html =
    kind === 'daily'
      ? [
          `⏰ <b>Time for today's check-in</b>`,
          `${date} isn't logged yet:`,
          ...lines,
          '',
          'It only takes a minute.',
        ].join('\n')
      : [
          `🌙 <b>No log yet for ${date}</b>`,
          ...lines,
          '',
          "A missed day isn't a failure — fill in what you remember, now or later.",
        ].join('\n');

  const buttons = appUrl
    ? trackers.map((t) => ({
        text:
          trackers.length === 1
            ? kind === 'daily'
              ? 'Log today'
              : `Fill in ${date}`
            : `Log ${t.name}`.slice(0, 60),
        url: `${appUrl}/journey-trackers/${t.id}/daily/${day}`,
      }))
    : [];

  return { html, buttons };
}

/**
 * Sends the 3 pm "not logged yet" reminder and the 11:30 pm "day about to be missed" alert to
 * every user with a linked Telegram chat who has an active tracker still unlogged for the day.
 * Runs from Vercel Cron (eco mode) or the in-process scheduler (pro mode); safe to run twice.
 */
@Injectable()
export class TelegramAlertsService {
  private readonly logger = new Logger(TelegramAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private entries: TrackerEntryService,
    private config: ConfigService,
  ) {}

  get timeZone() {
    return this.config.get<string>('REMINDER_TIMEZONE') || DEFAULT_REMINDER_TIMEZONE;
  }

  private get appUrl(): string | null {
    const url = this.config.get<string>('FRONTEND_URL');
    return url ? url.replace(/\/+$/, '') : null;
  }

  async run(kind: AlertKind, options: { now?: Date; day?: string } = {}): Promise<AlertRunResult> {
    const day = options.day ?? alertDay(kind, options.now ?? new Date(), this.timeZone);
    const result: AlertRunResult = {
      kind,
      day,
      timeZone: this.timeZone,
      linkedUsers: 0,
      sent: 0,
      skipped: 0,
      duplicates: 0,
      failed: 0,
    };
    if (!this.telegram.isConfigured) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set; skipping alerts');
      return result;
    }

    // Cron runs have no signed-in user, so these queries span all tenants by design.
    const links = (
      await this.prisma.telegramLink.findMany({ where: { chatId: { not: null } } })
    ).filter((l) => !!l.chatId);
    result.linkedUsers = links.length;

    for (const link of links) {
      const optedIn =
        kind === 'daily' ? link.dailyReminder !== false : link.missedDayAlert !== false;
      const pending = optedIn ? await this.pendingTrackers(link.userId, day) : [];
      if (!pending.length) {
        result.skipped++;
        continue;
      }

      // Claim the (user, kind, day) slot before sending. The lookup covers ordinary re-runs (and
      // a database where `prisma db push` hasn't created the unique index yet); the unique index
      // covers two runs racing each other.
      const alreadySent = await this.prisma.telegramAlertLog.findFirst({
        where: { userId: link.userId, kind, day },
      });
      if (alreadySent) {
        result.duplicates++;
        continue;
      }
      let claimId: string;
      try {
        claimId = (
          await this.prisma.telegramAlertLog.create({
            data: { userId: link.userId, tenantId: link.tenantId, kind, day },
          })
        ).id;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          result.duplicates++;
          continue;
        }
        throw err;
      }

      const { html, buttons } = buildAlertMessage(kind, day, pending, this.appUrl);
      try {
        await this.telegram.sendMessage(link.chatId!, html, buttons);
        result.sent++;
      } catch (err) {
        result.failed++;
        // Release the claim so a later run can try again…
        await this.prisma.telegramAlertLog
          .delete({ where: { id: claimId } })
          .catch(() => undefined);
        // …unless the user blocked the bot, in which case stop messaging that chat.
        if (err instanceof TelegramApiError && err.chatIsGone) {
          await this.prisma.telegramLink.update({
            where: { id: link.id },
            data: { chatId: null, username: null, linkedAt: null },
          });
          this.logger.warn(`Telegram chat for user ${link.userId} is gone; unlinked it`);
        } else {
          this.logger.error(
            `Telegram ${kind} alert to user ${link.userId} failed: ${(err as Error).message}`,
          );
        }
      }
    }

    this.logger.log(`Telegram ${kind} alerts for ${day}: ${JSON.stringify(result)}`);
    return result;
  }

  /** Active trackers that are running on `day`, expect daily logs, and have none for it yet. */
  private async pendingTrackers(userId: string, day: string): Promise<PendingTracker[]> {
    const trackers = await this.prisma.journeyTracker.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    const pending: PendingTracker[] = [];
    for (const tracker of trackers) {
      const status = await this.entries.getLoggingStatus(userId, tracker.id, day);
      const running = status.started && (!status.endDate || day <= status.endDate);
      if (running && status.hasDailyFields && !status.loggedToday) {
        pending.push({
          id: tracker.id,
          name: tracker.name,
          dayNumber: status.dayNumber,
          totalDays: status.totalDays,
          earlierMissed: status.missedDays.length,
        });
      }
    }
    return pending;
  }
}

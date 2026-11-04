import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { JourneySummaryService } from '../journey-tracker/journey-summary.service';
import { addDays, dayOf, daysBetween } from '../journey-tracker/tracker-dates';
import { escapeHtml, TelegramService } from '../telegram/telegram.service';
import { alertDay, DEFAULT_REMINDER_TIMEZONE } from '../telegram/telegram-schedule';
import { ClaudeService } from './claude.service';
import {
  JOURNEY_REVIEW_FORMAT,
  JourneyReviewContent,
  REVIEW_SYSTEM_PROMPT,
} from './journey-review.schema';

const WEEK_DAYS = 7;
/** Asking again within this window returns 429, so a double click can't double the bill. */
const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;
/** A scheduled run stops starting new reviews after this long (each call can take a while). */
const DEFAULT_CRON_BUDGET_MS = 240_000;
/** A scheduled run still reviews a week that ended up to this many days ago (catch-up after a missed run). */
const CATCH_UP_DAYS = 6;

export interface ReviewPeriod {
  week: number;
  from: string;
  to: string;
}

/**
 * The last fully finished week of a journey on `day` — 7-day blocks counted from the start
 * date — or the final, shorter block when the journey's end date has been reached.
 */
export function finishedWeek(start: string, end: string | null, day: string): ReviewPeriod | null {
  const last = end && end < day ? end : day;
  if (last < start) return null;
  const elapsed = daysBetween(start, last) + 1;
  const full = Math.floor(elapsed / WEEK_DAYS);
  if (end && last === end && elapsed % WEEK_DAYS !== 0) {
    // The journey ended part-way through a week: that last stretch is the final review period.
    return { week: full + 1, from: addDays(start, full * WEEK_DAYS), to: end };
  }
  if (full === 0) return null;
  return {
    week: full,
    from: addDays(start, (full - 1) * WEEK_DAYS),
    to: addDays(start, full * WEEK_DAYS - 1),
  };
}

/** The week in progress on `day`, from its first day up to `day` — used for on-demand reviews. */
export function currentWeek(start: string, day: string): ReviewPeriod {
  const index = Math.max(0, Math.floor(daysBetween(start, day) / WEEK_DAYS));
  return {
    week: index + 1,
    from: addDays(start, index * WEEK_DAYS),
    to: day < start ? start : day,
  };
}

export interface ScheduledRunResult {
  day: string;
  considered: number;
  reviewed: number;
  alreadyDone: number;
  deferred: number;
  failed: number;
}

/**
 * Claude's reviews of a journey tracker: on demand ("Review now") and nightly for every active
 * tracker whose week just finished, optionally sent to the user's Telegram.
 */
@Injectable()
export class JourneyReviewService {
  private readonly logger = new Logger(JourneyReviewService.name);

  constructor(
    private prisma: PrismaService,
    private claude: ClaudeService,
    private summaries: JourneySummaryService,
    private telegram: TelegramService,
    private config: ConfigService,
  ) {}

  get isConfigured() {
    return this.claude.isConfigured;
  }

  private get timeZone() {
    return this.config.get<string>('REMINDER_TIMEZONE') || DEFAULT_REMINDER_TIMEZONE;
  }

  async list(userId: string, trackerId: string) {
    await this.assertTracker(userId, trackerId);
    const reviews = await this.prisma.journeyReview.findMany({
      where: { trackerId, userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { configured: this.isConfigured, reviews };
  }

  /** "Review now": the week so far. */
  async requestReview(userId: string, trackerId: string, today?: string) {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Claude reviews are not set up on this server');
    }
    const tracker = await this.assertTracker(userId, trackerId);
    const latest = await this.prisma.journeyReview.findFirst({
      where: { trackerId, userId },
      orderBy: { createdAt: 'desc' },
    });
    const wait = latest ? MANUAL_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime()) : 0;
    if (wait > 0) {
      throw new HttpException(
        `A review was just written. You can ask again in ${Math.ceil(wait / 60000)} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const day = today ?? alertDay('daily', new Date(), this.timeZone);
    const period = currentWeek(dayOf(tracker.startDate), day);
    return this.generate(userId, tracker.tenantId, trackerId, 'manual', period, day);
  }

  /** The nightly job: reviews each active tracker's just-finished week, once. */
  async runScheduled(options: { now?: Date; day?: string } = {}): Promise<ScheduledRunResult> {
    // Runs just before midnight; like the missed-day alert, it's about the day that is ending.
    const day = options.day ?? alertDay('missed', options.now ?? new Date(), this.timeZone);
    const result: ScheduledRunResult = {
      day,
      considered: 0,
      reviewed: 0,
      alreadyDone: 0,
      deferred: 0,
      failed: 0,
    };
    if (!this.isConfigured) {
      this.logger.warn('ANTHROPIC_API_KEY is not set; skipping scheduled journey reviews');
      return result;
    }

    const budget =
      Number(this.config.get<string>('REVIEW_CRON_BUDGET_MS')) || DEFAULT_CRON_BUDGET_MS;
    const started = Date.now();
    // No signed-in user here: this deliberately spans every tenant's active trackers.
    const trackers = await this.prisma.journeyTracker.findMany({ where: { status: 'ACTIVE' } });

    for (const tracker of trackers) {
      const week = finishedWeek(
        dayOf(tracker.startDate),
        tracker.endDate ? dayOf(tracker.endDate) : null,
        day,
      );
      if (!week || daysBetween(week.to, day) > CATCH_UP_DAYS) continue;
      result.considered++;

      const done = await this.prisma.journeyReview.findFirst({
        where: { trackerId: tracker.id, kind: 'weekly', periodEnd: week.to },
      });
      if (done) {
        result.alreadyDone++;
        continue;
      }
      if (Date.now() - started > budget) {
        result.deferred++; // picked up by a later run within the catch-up window
        continue;
      }

      try {
        const review = await this.generate(
          tracker.userId,
          tracker.tenantId,
          tracker.id,
          'weekly',
          week,
          day,
        );
        result.reviewed++;
        await this.notify(tracker.userId, tracker.id, tracker.name, week, review);
      } catch (err) {
        result.failed++;
        this.logger.error(
          `Weekly review for tracker ${tracker.id} failed: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`Scheduled journey reviews: ${JSON.stringify(result)}`);
    return result;
  }

  private async assertTracker(userId: string, trackerId: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({
      where: { id: trackerId, userId },
    });
    if (!tracker) throw new NotFoundException('Tracker not found');
    return tracker;
  }

  private async generate(
    userId: string,
    tenantId: string,
    trackerId: string,
    kind: 'weekly' | 'manual',
    period: ReviewPeriod,
    today: string,
  ) {
    const summary = await this.summaries.getSummary(userId, trackerId, today);
    const content = await this.askClaude(kind, period, summary);
    return this.prisma.journeyReview.create({
      data: {
        trackerId,
        userId,
        tenantId,
        kind,
        periodStart: period.from,
        periodEnd: period.to,
        headline: content.review.headline,
        summary: content.review.summary,
        wins: content.review.wins,
        concerns: content.review.concerns,
        suggestions: content.review.suggestions,
        model: content.model,
      },
    });
  }

  private async askClaude(kind: 'weekly' | 'manual', period: ReviewPeriod, summary: unknown) {
    const scope =
      kind === 'weekly'
        ? `week ${period.week} of the journey, ${period.from} to ${period.to}, which has just finished`
        : `week ${period.week} so far, ${period.from} to ${period.to} (the week is still in progress)`;
    const prompt = `Please review ${scope}. Focus on this period, using the rest of the journey for context.\n\n<journey_data>\n${JSON.stringify(summary)}\n</journey_data>`;

    let response;
    try {
      response = await this.claude.anthropic.beta.messages.parse({
        model: this.claude.model,
        max_tokens: 16000,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort: 'high', format: JOURNEY_REVIEW_FORMAT },
        // If a safety classifier declines, the API re-runs the request on Anthropic's
        // recommended fallback model instead of returning a refusal.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new HttpException(
          'Claude is busy right now — please try again shortly',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ServiceUnavailableException('The Claude API key is invalid');
      }
      if (err instanceof Anthropic.APIError) {
        throw new BadGatewayException(`Claude request failed (${err.status ?? 'network'})`);
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      throw new BadGatewayException('Claude declined to review this data');
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new BadGatewayException('Claude returned an incomplete review');
    }
    // parsed_output has been validated against JourneyReviewOutput by the SDK; the annotation
    // just keeps its type stable across compilers that infer the SDK's generics differently.
    const review: JourneyReviewContent = response.parsed_output as JourneyReviewContent;
    return { review, model: response.model };
  }

  private async notify(
    userId: string,
    trackerId: string,
    trackerName: string,
    week: ReviewPeriod,
    review: { headline: string; suggestions: unknown },
  ) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link?.chatId || link.weeklyReview === false || !this.telegram.isConfigured) return;
    const suggestions = (review.suggestions as { title: string }[]).slice(0, 3);
    const html = [
      `📋 <b>Week ${week.week} review · ${escapeHtml(trackerName)}</b>`,
      escapeHtml(review.headline),
      ...(suggestions.length
        ? ['', '<b>For next week:</b>', ...suggestions.map((s) => `• ${escapeHtml(s.title)}`)]
        : []),
    ].join('\n');
    const appUrl = this.config.get<string>('FRONTEND_URL')?.replace(/\/+$/, '');
    const buttons = appUrl
      ? [
          {
            text: 'Read the full review',
            url: `${appUrl}/journey-trackers/${trackerId}/weekly-review`,
          },
        ]
      : [];
    await this.telegram
      .sendMessage(link.chatId, html, buttons)
      .catch((err) =>
        this.logger.warn(`Telegram review message failed: ${(err as Error).message}`),
      );
  }
}

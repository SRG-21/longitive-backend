import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackerEntryService } from './tracker-entry.service';
import { dayOf } from './tracker-dates';

type Values = Record<string, unknown>;

const RECENT_DAYS = 14;
const MAX_TREND_POINTS = 120;
const TARGET_KEYS = new Set(['weight', 'waist', 'bodyFatPct']);

/**
 * One self-contained picture of a journey tracker — schedule, fields with their starting
 * values and targets, logging status, recent entries and number trends — shaped for a model
 * to read. Claude's reviews and the MCP tools both use it, so they see the same facts.
 */
@Injectable()
export class JourneySummaryService {
  constructor(
    private prisma: PrismaService,
    private entries: TrackerEntryService,
  ) {}

  async listTrackers(userId: string, today: string) {
    const trackers = await this.prisma.journeyTracker.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      trackers.map(async (t) => {
        const status = await this.entries.getLoggingStatus(userId, t.id, today);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          startDate: status.startDate,
          proposedEndDate: status.endDate,
          dayNumber: status.dayNumber,
          totalDays: status.totalDays,
          loggedToday: status.loggedToday,
          missedDays: status.missedDays.length,
        };
      }),
    );
  }

  async getSummary(userId: string, trackerId: string, today: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({
      where: { id: trackerId, userId },
      include: { fields: true },
    });
    if (!tracker) throw new NotFoundException('Tracker not found');

    const [status, review, entries] = await Promise.all([
      this.entries.getLoggingStatus(userId, trackerId, today),
      this.entries.getWeeklyReview(userId, trackerId, today),
      this.prisma.trackerEntry.findMany({ where: { trackerId }, orderBy: { date: 'asc' } }),
    ]);

    const baseline = (tracker.baseline as Values | null) ?? {};
    const targets = (tracker.targets as Values | null) ?? {};
    const fields = tracker.fields
      .filter((f) => f.isActive && f.type !== 'FORMULA')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const numeric = fields.filter(
      (f) => f.type === 'NUMBER' || f.type === 'DURATION' || f.type === 'RATING',
    );

    const valueOf = (e: { values: unknown }, key: string) =>
      ((e.values as Values | null) ?? {})[key];
    const isSet = (v: unknown) => v !== null && v !== undefined && v !== '';

    const fieldSummaries = fields.map((f) => {
      const logged = entries.filter((e) => isSet(valueOf(e, f.key)));
      const last = logged[logged.length - 1];
      const latest = last ? valueOf(last, f.key) : null;
      const isTarget = TARGET_KEYS.has(f.key) || f.cadence === 'WEEKLY';
      const start =
        isTarget && typeof baseline[f.key] === 'number' ? (baseline[f.key] as number) : null;
      const target =
        isTarget && typeof targets[f.key] === 'number' ? (targets[f.key] as number) : null;
      return {
        key: f.key,
        label: f.label,
        type: f.type,
        unit: f.unit ?? null,
        cadence: f.cadence === 'WEEKLY' ? 'weekly' : 'daily',
        required: f.required,
        options: f.options ?? undefined,
        startingValue: start,
        target,
        latest: last ? { value: latest, date: dayOf(last.date) } : null,
        changeFromStart:
          typeof latest === 'number' && start != null
            ? Math.round((latest - start) * 100) / 100
            : null,
        daysLogged: logged.length,
      };
    });

    const labelled = (values: Values) =>
      Object.fromEntries(
        fields.filter((f) => isSet(values[f.key])).map((f) => [f.label, values[f.key]]),
      );
    const recentFrom = entries.length ? entries.slice(-RECENT_DAYS) : [];

    return {
      tracker: {
        id: tracker.id,
        name: tracker.name,
        status: tracker.status,
        type: tracker.type,
        today,
        startDate: status.startDate,
        proposedEndDate: status.endDate,
        dayNumber: status.dayNumber,
        totalDays: status.totalDays,
        daysLeft: status.daysLeft,
      },
      fields: fieldSummaries,
      logging: {
        loggedToday: status.loggedToday,
        missedDaysTotal: status.missedDays.length,
        recentMissedDays: status.missedDays.slice(-RECENT_DAYS),
        weeklyCheckins: status.weeks.map((w) => ({
          week: w.week,
          from: w.from,
          to: w.to,
          status: w.status,
        })),
      },
      lastSevenDays: {
        daysLogged: review.daysTracked,
        daysMissed: review.missedDays,
        requiredHabitsCompletedPercent: review.completedHabitsPercentage,
        latestWeight: review.latestWeight,
        changeFromStartWeight: review.changeFromBaseline,
        progressToWeightTargetPercent: review.progressToTarget,
      },
      recentEntries: recentFrom.map((e) => ({
        date: dayOf(e.date),
        values: labelled((e.values as Values | null) ?? {}),
        remark: e.remark || undefined,
      })),
      trends: numeric.map((f) => ({
        field: f.label,
        unit: f.unit ?? null,
        points: entries
          .filter((e) => typeof valueOf(e, f.key) === 'number')
          .slice(-MAX_TREND_POINTS)
          .map((e) => ({ date: dayOf(e.date), value: valueOf(e, f.key) as number })),
      })),
    };
  }

  async getEntries(userId: string, trackerId: string, from?: string, to?: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({
      where: { id: trackerId, userId },
      include: { fields: true },
    });
    if (!tracker) throw new NotFoundException('Tracker not found');
    const entries = await this.entries.list(userId, trackerId, from, to);
    const labels = new Map(
      tracker.fields.map((f) => [f.key, f.unit ? `${f.label} (${f.unit})` : f.label]),
    );
    return entries.map((e) => ({
      date: dayOf(e.date),
      values: Object.fromEntries(
        Object.entries((e.values as Values | null) ?? {}).map(([k, v]) => [labels.get(k) ?? k, v]),
      ),
      remark: e.remark || undefined,
    }));
  }
}

export type JourneySummary = Awaited<ReturnType<JourneySummaryService['getSummary']>>;

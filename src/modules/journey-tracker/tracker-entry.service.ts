import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertEntryDto } from './dto';
import { addDays, dayOf, daysBetween, eachDay, isDay } from './tracker-dates';

type Values = Record<string, unknown>;

const WEEK_DAYS = 7;

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

/** Fields written before cadence existed have none, and are daily. */
function cadenceOf(field: { cadence?: string | null }): 'DAILY' | 'WEEKLY' {
  return field.cadence === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
}

@Injectable()
export class TrackerEntryService {
  constructor(private prisma: PrismaService) {}

  private async getTracker(userId: string, trackerId: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({
      where: { id: trackerId, userId },
      include: { fields: true },
    });
    if (!tracker) throw new NotFoundException('Tracker not found');
    return tracker;
  }

  async list(userId: string, trackerId: string, from?: string, to?: string) {
    await this.getTracker(userId, trackerId);
    const where: any = { trackerId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.trackerEntry.findMany({ where, orderBy: { date: 'asc' } });
  }

  private assertDay(date: string) {
    if (!isDay(date)) throw new BadRequestException('Date must be a valid YYYY-MM-DD day');
  }

  /** `today` comes from the client (its local calendar day); the server clock is only a fallback. */
  private resolveToday(today?: string): string {
    if (today !== undefined && !isDay(today)) {
      throw new BadRequestException('today must be a valid YYYY-MM-DD day');
    }
    return today ?? dayOf(new Date());
  }

  async getByDate(userId: string, trackerId: string, date: string) {
    this.assertDay(date);
    await this.getTracker(userId, trackerId);
    return this.prisma.trackerEntry.findUnique({
      where: { trackerId_date: { trackerId, date: new Date(date) } },
    });
  }

  async upsert(userId: string, trackerId: string, date: string, dto: UpsertEntryDto) {
    this.assertDay(date);
    const tracker = await this.getTracker(userId, trackerId);
    if (date < dayOf(tracker.startDate)) {
      throw new BadRequestException(
        `This tracker starts on ${dayOf(tracker.startDate)}, so entries can't be dated before that`,
      );
    }
    const entryDate = new Date(date);

    // Daily and weekly forms each send only their own fields, and fields can be removed or
    // added over time — so a save merges into what is already stored instead of replacing
    // it. A null value clears that one field; keys that aren't sent are left untouched.
    const existing = await this.prisma.trackerEntry.findUnique({
      where: { trackerId_date: { trackerId, date: entryDate } },
    });
    const values: Values = { ...((existing?.values as Values | null) ?? {}) };
    for (const [key, value] of Object.entries(dto.values)) {
      if (value === null) delete values[key];
      else values[key] = value;
    }

    const entry = await this.prisma.trackerEntry.upsert({
      where: { trackerId_date: { trackerId, date: entryDate } },
      create: {
        trackerId,
        date: entryDate,
        values,
        remark: dto.remark,
        completedAt: new Date(),
      } as any,
      update: {
        values,
        remark: dto.remark,
        completedAt: new Date(),
      } as any,
    });

    const syncWeightFieldKey = (tracker.settings as any)?.syncWeightFieldKey;
    if (syncWeightFieldKey && dto.values[syncWeightFieldKey] != null) {
      await this.syncWeightToBodyComposition(
        userId,
        entryDate,
        Number(dto.values[syncWeightFieldKey]),
      );
    }

    return entry;
  }

  private async syncWeightToBodyComposition(userId: string, date: Date, weight: number) {
    const existing = await this.prisma.bodyComposition.findFirst({ where: { userId, date } });
    const latest = await this.prisma.bodyComposition.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    const bmi = latest?.height
      ? Math.round((weight / (latest.height / 100) ** 2) * 10) / 10
      : undefined;

    if (existing) {
      await this.prisma.bodyComposition.update({
        where: { id: existing.id },
        data: { weight, ...(bmi != null && { bmi }) },
      });
    } else {
      await this.prisma.bodyComposition.create({
        data: { userId, date, weight, ...(bmi != null && { bmi }), source: 'MANUAL' } as any,
      });
    }
  }

  async getChartData(userId: string, trackerId: string) {
    const tracker = await this.getTracker(userId, trackerId);
    const entries = await this.prisma.trackerEntry.findMany({
      where: { trackerId },
      orderBy: { date: 'asc' },
    });

    const chartableFields = tracker.fields
      .filter((f) => f.chartable && f.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const baseline = (tracker.baseline as any) || {};

    const weights = entries.map(
      (e) => (e.values as any)?.[(tracker.settings as any)?.syncWeightFieldKey || 'weight'],
    );

    return {
      dates: entries.map((e) => e.date),
      series: chartableFields.map((field) => ({
        key: field.key,
        label: field.label,
        unit: field.unit,
        cadence: cadenceOf(field),
        values: entries.map((e) => {
          const values = (e.values as Values | null) ?? {};
          if (field.type === 'FORMULA' && field.key.endsWith('Change')) {
            // "<key>Change" is the logged value minus where the journey started.
            const sourceKey = field.key.slice(0, -'Change'.length);
            const current = values[sourceKey];
            const start = baseline[sourceKey];
            return typeof current === 'number' && typeof start === 'number'
              ? Math.round((current - start) * 100) / 100
              : null;
          }
          return values[field.key] ?? null;
        }),
      })),
      weightRollingAverage: entries.map((_, idx) => {
        const window = weights
          .slice(Math.max(0, idx - 6), idx + 1)
          .filter((w) => typeof w === 'number');
        if (!window.length) return null;
        return Math.round((window.reduce((s, w) => s + w, 0) / window.length) * 100) / 100;
      }),
    };
  }

  /**
   * Where the user stands against the schedule: which days they haven't logged, which weeks
   * are missing their weekly check-in, and how far into the journey they are. Today is never
   * "missed" — it's still open — and nothing before the start date or after the end date counts.
   */
  async getLoggingStatus(userId: string, trackerId: string, today?: string) {
    const tracker = await this.getTracker(userId, trackerId);
    const todayDay = this.resolveToday(today);
    const entries = await this.prisma.trackerEntry.findMany({
      where: { trackerId },
      orderBy: { date: 'asc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isDayLogged, ...status } = this.buildLoggingStatus(tracker, entries, todayDay);
    return status;
  }

  private buildLoggingStatus(
    tracker: Awaited<ReturnType<TrackerEntryService['getTracker']>>,
    entries: { date: Date; values: unknown; remark: string | null }[],
    todayDay: string,
  ) {
    const start = dayOf(tracker.startDate);
    const end = tracker.endDate ? dayOf(tracker.endDate) : null;
    const started = start <= todayDay;
    // The last day a log can still be expected: today, or the end date once it has passed.
    const lastExpected = end && end < todayDay ? end : todayDay;

    const activeFields = tracker.fields.filter((f) => f.isActive && f.type !== 'FORMULA');
    const dailyFields = activeFields.filter((f) => cadenceOf(f) === 'DAILY');
    const weeklyFields = activeFields.filter((f) => cadenceOf(f) === 'WEEKLY');

    const byDay = new Map(entries.map((e) => [dayOf(e.date), e]));
    const isDayLogged = (day: string) => {
      const entry = byDay.get(day);
      if (!entry) return false;
      if (entry.remark?.trim()) return true;
      const values = (entry.values as Values | null) ?? {};
      // With no daily fields at all (everything is weekly) any saved entry counts.
      return dailyFields.length ? dailyFields.some((f) => hasValue(values[f.key])) : true;
    };

    const missedDays = started
      ? eachDay(start, lastExpected).filter((day) => day < todayDay && !isDayLogged(day))
      : [];

    const weeks: {
      week: number;
      from: string;
      to: string;
      status: 'logged' | 'missed' | 'due';
      loggedDate: string | null;
    }[] = [];
    if (started && weeklyFields.length) {
      for (
        let from = start, week = 1;
        from <= lastExpected;
        from = addDays(from, WEEK_DAYS), week++
      ) {
        const naturalEnd = addDays(from, WEEK_DAYS - 1);
        const to = end && end < naturalEnd ? end : naturalEnd;
        const loggedOn = eachDay(from, to).filter((day) => {
          const values = (byDay.get(day)?.values as Values | undefined) ?? {};
          return weeklyFields.some((f) => hasValue(values[f.key]));
        });
        weeks.push({
          week,
          from,
          to,
          loggedDate: loggedOn.length ? loggedOn[loggedOn.length - 1] : null,
          status: loggedOn.length ? 'logged' : to < todayDay ? 'missed' : 'due',
        });
      }
    }

    const totalDays = end ? daysBetween(start, end) + 1 : null;
    const dayNumber = started
      ? Math.min(daysBetween(start, todayDay) + 1, totalDays ?? Infinity)
      : 0;

    return {
      today: todayDay,
      startDate: start,
      endDate: end,
      started,
      dayNumber,
      totalDays,
      daysLeft: end && started ? Math.max(0, daysBetween(todayDay, end)) : null,
      hasDailyFields: dailyFields.length > 0,
      hasWeeklyFields: weeklyFields.length > 0,
      loggedToday: started && todayDay <= (end ?? todayDay) && isDayLogged(todayDay),
      missedDays,
      weeks,
      isDayLogged,
    };
  }

  async getWeeklyReview(userId: string, trackerId: string, today?: string) {
    const tracker = await this.getTracker(userId, trackerId);
    const todayDay = this.resolveToday(today);
    const entries = await this.prisma.trackerEntry.findMany({
      where: { trackerId },
      orderBy: { date: 'asc' },
    });
    const { isDayLogged, missedDays, started } = this.buildLoggingStatus(
      tracker,
      entries,
      todayDay,
    );

    // The review covers the last 7 days, but never reaches back before the journey began.
    const start = dayOf(tracker.startDate);
    const windowFrom =
      addDays(todayDay, -(WEEK_DAYS - 1)) < start ? start : addDays(todayDay, -(WEEK_DAYS - 1));
    const windowEntries = entries.filter((e) => {
      const day = dayOf(e.date);
      return day >= windowFrom && day <= todayDay;
    });

    const settings = (tracker.settings as Values | null) ?? {};
    const weightFieldKey = (settings.syncWeightFieldKey as string) || 'weight';
    const weightOf = (e: { values: unknown }) =>
      ((e.values as Values | null) ?? {})[weightFieldKey];

    const windowWeights = windowEntries
      .map(weightOf)
      .filter((w): w is number => typeof w === 'number');
    const averageWeight = windowWeights.length
      ? windowWeights.reduce((sum, w) => sum + w, 0) / windowWeights.length
      : null;

    // Weight may be a weekly field, so "where am I now" is the latest weight ever logged
    // rather than whatever happens to fall inside the 7-day window.
    const weighed = entries.filter((e) => typeof weightOf(e) === 'number');
    const latest = weighed.length ? weighed[weighed.length - 1] : null;
    const latestWeight = latest ? (weightOf(latest) as number) : null;

    const baselineWeight = ((tracker.baseline as Values | null) ?? {})[weightFieldKey];
    const targetWeight = ((tracker.targets as Values | null) ?? {})[weightFieldKey];
    const baseline = typeof baselineWeight === 'number' ? baselineWeight : null;
    const target = typeof targetWeight === 'number' ? targetWeight : null;

    let progressToTarget: number | null = null;
    if (baseline != null && target != null && latestWeight != null && baseline !== target) {
      const fraction = (baseline - latestWeight) / (baseline - target);
      progressToTarget = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    }

    const requiredDaily = tracker.fields.filter(
      (f) => f.isActive && f.required && f.type !== 'FORMULA' && cadenceOf(f) === 'DAILY',
    );
    const loggedDays = windowEntries.filter((e) => isDayLogged(dayOf(e.date)));
    const completionRates = loggedDays.map((e) => {
      if (!requiredDaily.length) return 1;
      const values = (e.values as Values | null) ?? {};
      return requiredDaily.filter((f) => hasValue(values[f.key])).length / requiredDaily.length;
    });
    const avgCompletion = completionRates.length
      ? Math.round((completionRates.reduce((sum, c) => sum + c, 0) / completionRates.length) * 100)
      : 0;

    const missedDates = started ? missedDays.filter((day) => day >= windowFrom) : [];

    return {
      averageWeight: averageWeight != null ? Math.round(averageWeight * 100) / 100 : null,
      latestWeight,
      latestWeightDate: latest ? dayOf(latest.date) : null,
      baselineWeight: baseline,
      targetWeight: target,
      changeFromBaseline:
        latestWeight != null && baseline != null
          ? Math.round((latestWeight - baseline) * 100) / 100
          : null,
      progressToTarget,
      completedHabitsPercentage: avgCompletion,
      daysTracked: loggedDays.length,
      missedDays: missedDates.length,
      missedDates,
      windowFrom,
      windowTo: todayDay,
    };
  }

  async exportCsv(userId: string, trackerId: string): Promise<string> {
    const tracker = await this.getTracker(userId, trackerId);
    const entries = await this.prisma.trackerEntry.findMany({
      where: { trackerId },
      orderBy: { date: 'asc' },
    });
    const fields = tracker.fields
      .filter((f) => f.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const header = ['date', ...fields.map((f) => f.label), 'remark'];
    const rows = entries.map((e) => {
      const values = (e.values as any) || {};
      const cells = [
        e.date.toISOString().slice(0, 10),
        ...fields.map((f) => csvEscape(values[f.key])),
        csvEscape(e.remark),
      ];
      return cells.join(',');
    });

    return [header.map(csvEscape).join(','), ...rows].join('\n');
  }
}

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

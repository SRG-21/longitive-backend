import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertEntryDto } from './dto';

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

  async getByDate(userId: string, trackerId: string, date: string) {
    await this.getTracker(userId, trackerId);
    return this.prisma.trackerEntry.findUnique({
      where: { trackerId_date: { trackerId, date: new Date(date) } },
    });
  }

  async upsert(userId: string, trackerId: string, date: string, dto: UpsertEntryDto) {
    const tracker = await this.getTracker(userId, trackerId);
    const entryDate = new Date(date);

    const entry = await this.prisma.trackerEntry.upsert({
      where: { trackerId_date: { trackerId, date: entryDate } },
      create: {
        trackerId,
        date: entryDate,
        values: dto.values,
        remark: dto.remark,
        completedAt: new Date(),
      } as any,
      update: {
        values: dto.values,
        remark: dto.remark,
        completedAt: new Date(),
      } as any,
    });

    const syncWeightFieldKey = (tracker.settings as any)?.syncWeightFieldKey;
    if (syncWeightFieldKey && dto.values[syncWeightFieldKey] != null) {
      await this.syncWeightToBodyComposition(userId, entryDate, Number(dto.values[syncWeightFieldKey]));
    }

    return entry;
  }

  private async syncWeightToBodyComposition(userId: string, date: Date, weight: number) {
    const existing = await this.prisma.bodyComposition.findFirst({ where: { userId, date } });
    const latest = await this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
    const bmi = latest?.height ? Math.round((weight / (latest.height / 100) ** 2) * 10) / 10 : undefined;

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

    const chartableFields = tracker.fields.filter((f) => f.chartable && f.isActive);
    const baseline = (tracker.baseline as any) || {};

    const weights = entries.map((e) => (e.values as any)?.[(tracker.settings as any)?.syncWeightFieldKey || 'weight']);

    return {
      dates: entries.map((e) => e.date),
      series: chartableFields.map((field) => ({
        key: field.key,
        label: field.label,
        unit: field.unit,
        values: entries.map((e) => {
          const raw = (e.values as any)?.[field.key];
          return field.type === 'FORMULA' && baseline[field.key.replace('Change', '')] != null
            ? raw
            : raw ?? null;
        }),
      })),
      weightRollingAverage: entries.map((_, idx) => {
        const window = weights.slice(Math.max(0, idx - 6), idx + 1).filter((w) => typeof w === 'number');
        if (!window.length) return null;
        return Math.round((window.reduce((s, w) => s + w, 0) / window.length) * 100) / 100;
      }),
    };
  }

  async getWeeklyReview(userId: string, trackerId: string) {
    const tracker = await this.getTracker(userId, trackerId);
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const entries = await this.prisma.trackerEntry.findMany({
      where: { trackerId, date: { gte: weekAgo, lte: today } },
      orderBy: { date: 'asc' },
    });

    const weightFieldKey = (tracker.settings as any)?.syncWeightFieldKey || 'weight';
    const weights = entries
      .map((e) => (e.values as any)?.[weightFieldKey])
      .filter((w) => typeof w === 'number');
    const avgWeight = weights.length ? weights.reduce((s, w) => s + w, 0) / weights.length : null;
    const baselineWeight = (tracker.baseline as any)?.[weightFieldKey];

    const requiredFields = tracker.fields.filter((f) => f.isActive && f.required);
    const completionRates = entries.map((e) => {
      if (!requiredFields.length) return 1;
      const filled = requiredFields.filter((f) => (e.values as any)?.[f.key] != null).length;
      return filled / requiredFields.length;
    });
    const avgCompletion = completionRates.length
      ? Math.round((completionRates.reduce((s, c) => s + c, 0) / completionRates.length) * 100)
      : 0;

    const expectedDays = 7;
    const missedDays = Math.max(0, expectedDays - entries.length);

    return {
      averageWeight: avgWeight != null ? Math.round(avgWeight * 100) / 100 : null,
      changeFromBaseline:
        avgWeight != null && baselineWeight != null ? Math.round((avgWeight - baselineWeight) * 100) / 100 : null,
      completedHabitsPercentage: avgCompletion,
      daysTracked: entries.length,
      missedDays,
    };
  }

  async exportCsv(userId: string, trackerId: string): Promise<string> {
    const tracker = await this.getTracker(userId, trackerId);
    const entries = await this.prisma.trackerEntry.findMany({ where: { trackerId }, orderBy: { date: 'asc' } });
    const fields = tracker.fields.filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

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

import { BadRequestException } from '@nestjs/common';
import { TrackerEntryService } from './tracker-entry.service';

const field = (
  key: string,
  cadence: 'DAILY' | 'WEEKLY' | null,
  extra: Record<string, unknown> = {},
) => ({
  id: key,
  key,
  label: key,
  type: 'NUMBER',
  isActive: true,
  required: false,
  chartable: true,
  cadence,
  ...extra,
});

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('TrackerEntryService', () => {
  let service: TrackerEntryService;
  let entries: { date: Date; values: Record<string, unknown>; remark: string | null }[];
  let tracker: any;
  const upsert = jest.fn();

  beforeEach(() => {
    entries = [];
    tracker = {
      id: 't1',
      startDate: day('2026-11-01'),
      endDate: null,
      baseline: { weight: 90 },
      targets: { weight: 80 },
      settings: {},
      fields: [field('steps', 'DAILY'), field('mood', null), field('weight', 'WEEKLY')],
    };
    upsert
      .mockReset()
      .mockImplementation(async ({ create, update }) => ({ ...(create ?? update) }));
    const prisma: any = {
      journeyTracker: { findFirst: jest.fn(async () => tracker) },
      trackerEntry: {
        findMany: jest.fn(async () => entries),
        findUnique: jest.fn(async ({ where }) => {
          const wanted = where.trackerId_date.date.toISOString().slice(0, 10);
          return entries.find((e) => e.date.toISOString().slice(0, 10) === wanted) ?? null;
        }),
        upsert,
      },
      bodyComposition: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    service = new TrackerEntryService(prisma);
  });

  describe('upsert', () => {
    it('rejects dates before the start date', async () => {
      await expect(
        service.upsert('u1', 't1', '2026-10-31', { values: { steps: 1 } }),
      ).rejects.toThrow(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects malformed dates', async () => {
      await expect(service.upsert('u1', 't1', '2026-02-31', { values: {} })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.upsert('u1', 't1', 'tomorrow', { values: {} })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts the start date itself', async () => {
      await service.upsert('u1', 't1', '2026-11-01', { values: { steps: 1 } });
      expect(upsert).toHaveBeenCalled();
    });

    it('merges into stored values and clears a field only when sent as null', async () => {
      entries.push({
        date: day('2026-11-02'),
        values: { steps: 5000, weight: 88, mood: 7 },
        remark: null,
      });
      await service.upsert('u1', 't1', '2026-11-02', { values: { steps: 6000, mood: null } });
      const { update } = upsert.mock.calls[0][0];
      // weight (not sent) survives, mood (null) is removed, steps is overwritten
      expect(update.values).toEqual({ steps: 6000, weight: 88 });
    });
  });

  describe('getLoggingStatus', () => {
    it('lists unlogged days before today, never today itself', async () => {
      entries.push({ date: day('2026-11-02'), values: { steps: 4000 }, remark: null });
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-04');
      expect(status.missedDays).toEqual(['2026-11-01', '2026-11-03']);
      expect(status.loggedToday).toBe(false);
      expect(status.dayNumber).toBe(4);
    });

    it('does not count a weekly-only entry as a daily log', async () => {
      entries.push({ date: day('2026-11-02'), values: { weight: 88 }, remark: null });
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-03');
      expect(status.missedDays).toEqual(['2026-11-01', '2026-11-02']);
    });

    it('counts a remark-only entry as logged', async () => {
      entries.push({ date: day('2026-11-01'), values: {}, remark: 'rest day' });
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-02');
      expect(status.missedDays).toEqual([]);
    });

    it('has nothing missed before the tracker starts', async () => {
      const status = await service.getLoggingStatus('u1', 't1', '2026-10-30');
      expect(status).toMatchObject({ started: false, dayNumber: 0, missedDays: [], weeks: [] });
    });

    it('stops expecting logs after the end date', async () => {
      tracker.endDate = day('2026-11-03');
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-20');
      expect(status.missedDays).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
      expect(status).toMatchObject({ totalDays: 3, dayNumber: 3, daysLeft: 0 });
    });

    it('tracks weekly check-ins per 7-day block from the start date', async () => {
      entries.push({ date: day('2026-11-05'), values: { weight: 89 }, remark: null });
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-16');
      expect(status.weeks.map((w) => [w.week, w.from, w.to, w.status])).toEqual([
        [1, '2026-11-01', '2026-11-07', 'logged'],
        [2, '2026-11-08', '2026-11-14', 'missed'],
        [3, '2026-11-15', '2026-11-21', 'due'],
      ]);
      expect(status.weeks[0].loggedDate).toBe('2026-11-05');
    });

    it('treats fields without a stored cadence as daily', async () => {
      entries.push({ date: day('2026-11-01'), values: { mood: 6 }, remark: null });
      const status = await service.getLoggingStatus('u1', 't1', '2026-11-02');
      expect(status.missedDays).toEqual([]);
    });
  });

  describe('getChartData', () => {
    it('lists charted fields in the order they are set up, skipping inactive and unticked ones', async () => {
      tracker.fields = [
        field('waist', 'WEEKLY', { sortOrder: 2 }),
        field('steps', 'DAILY', { sortOrder: 1 }),
        field('mood', 'DAILY', { sortOrder: 0, chartable: false }),
        field('old', 'DAILY', { sortOrder: 3, isActive: false }),
      ];
      const chart = await service.getChartData('u1', 't1');
      expect(chart.series.map((s) => s.key)).toEqual(['steps', 'waist']);
      expect(chart.series.map((s) => s.cadence)).toEqual(['DAILY', 'WEEKLY']);
    });

    it('computes a "<key>Change" formula from the baseline and leaves gaps as null', async () => {
      tracker.fields = [field('weightChange', null, { type: 'FORMULA', sortOrder: 0 })];
      entries.push({ date: day('2026-11-02'), values: { weight: 88 }, remark: null });
      entries.push({ date: day('2026-11-03'), values: { steps: 10 }, remark: null });
      const chart = await service.getChartData('u1', 't1');
      expect(chart.series[0].values).toEqual([-2, null]);
    });
  });

  describe('getWeeklyReview', () => {
    it('reports missed days only from the start date, not a fixed 7', async () => {
      const review = await service.getWeeklyReview('u1', 't1', '2026-11-03');
      expect(review.missedDates).toEqual(['2026-11-01', '2026-11-02']);
      expect(review.missedDays).toBe(2);
      expect(review.windowFrom).toBe('2026-11-01');
    });

    it('uses the latest weight ever logged and progress toward the target', async () => {
      entries.push({ date: day('2026-11-01'), values: { weight: 90 }, remark: null });
      entries.push({ date: day('2026-11-08'), values: { weight: 85 }, remark: null });
      const review = await service.getWeeklyReview('u1', 't1', '2026-11-20');
      expect(review).toMatchObject({
        latestWeight: 85,
        latestWeightDate: '2026-11-08',
        changeFromBaseline: -5,
      });
      expect(review.progressToTarget).toBe(50);
    });
  });
});

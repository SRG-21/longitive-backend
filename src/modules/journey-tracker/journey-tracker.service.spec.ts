import { NotFoundException } from '@nestjs/common';
import { JourneyTrackerService } from './journey-tracker.service';
import { buildWeightLossTemplate } from './templates/weight-loss.template';

describe('JourneyTrackerService.remove', () => {
  let prisma: any;
  let service: JourneyTrackerService;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    prisma = {
      journeyTracker: {
        findFirst: jest.fn(async ({ where }) =>
          where.id === 't1' && where.userId === 'u1' ? { id: 't1' } : null,
        ),
        delete: jest.fn(async () => calls.push('tracker')),
      },
      trackerEntry: { deleteMany: jest.fn(async () => (calls.push('entries'), { count: 12 })) },
      trackerField: { deleteMany: jest.fn(async () => (calls.push('fields'), { count: 7 })) },
    };
    service = new JourneyTrackerService(prisma);
  });

  it("deletes the tracker's entries and fields, then the tracker", async () => {
    await expect(service.remove('u1', 't1')).resolves.toEqual({
      deleted: true,
      entries: 12,
      fields: 7,
    });
    expect(calls).toEqual(['entries', 'fields', 'tracker']);
    expect(prisma.trackerEntry.deleteMany).toHaveBeenCalledWith({ where: { trackerId: 't1' } });
  });

  it("refuses to delete someone else's tracker and touches nothing", async () => {
    await expect(service.remove('u2', 't1')).rejects.toThrow(NotFoundException);
    expect(calls).toEqual([]);
  });
});

describe('buildWeightLossTemplate targets', () => {
  it('only targets body measurements from the profile goals', () => {
    const template = buildWeightLossTemplate({
      user: {
        goals: {
          targetWeightKg: 76,
          targetWaistCm: 85,
          targetDailySteps: 8000,
          targetSleepHours: 8,
        },
      },
      latestBodyComp: null,
      hasDiet: false,
      hasSupplements: false,
      hasHydration: false,
      hasExercise: false,
    });
    expect(template.targets).toEqual({ weight: 76, waist: 85 });
  });
});

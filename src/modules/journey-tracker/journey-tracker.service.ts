import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildWeightLossTemplate } from './templates/weight-loss.template';
import {
  CreateTrackerDto,
  UpdateTrackerDto,
  CreateFieldDto,
  UpdateFieldDto,
  ReorderFieldsDto,
} from './dto';
import { dayOf } from './tracker-dates';

@Injectable()
export class JourneyTrackerService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.journeyTracker.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({
      where: { id, userId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!tracker) throw new NotFoundException('Tracker not found');
    return tracker;
  }

  private async assertOwned(userId: string, id: string) {
    const tracker = await this.prisma.journeyTracker.findFirst({ where: { id, userId } });
    if (!tracker) throw new NotFoundException('Tracker not found');
    return tracker;
  }

  private assertDateOrder(startDate: Date | string, endDate?: Date | string | null) {
    if (endDate && dayOf(endDate) < dayOf(startDate)) {
      throw new BadRequestException("The end date can't be before the start date");
    }
  }

  async create(userId: string, dto: CreateTrackerDto) {
    const { fields, ...trackerData } = dto;
    this.assertDateOrder(trackerData.startDate, trackerData.endDate);
    const tracker = await this.prisma.journeyTracker.create({
      data: {
        userId,
        name: trackerData.name,
        type: trackerData.type || 'custom',
        cadence: (trackerData.cadence as any) || 'DAILY',
        startDate: new Date(trackerData.startDate),
        endDate: trackerData.endDate ? new Date(trackerData.endDate) : undefined,
        baseline: trackerData.baseline,
        targets: trackerData.targets,
        settings: trackerData.settings,
        status: 'DRAFT',
      } as any,
    });

    if (fields?.length) {
      await this.prisma.trackerField.createMany({
        data: fields.map((f, idx) => ({
          trackerId: tracker.id,
          key: f.key,
          label: f.label,
          type: f.type as any,
          unit: f.unit,
          options: f.options,
          target: f.target,
          required: f.required ?? false,
          chartable: f.chartable ?? false,
          scoringWeight: f.scoringWeight,
          cadence: (f.cadence as any) ?? 'DAILY',
          sortOrder: f.sortOrder ?? idx,
        })) as any,
      });
    }

    return this.getOne(userId, tracker.id);
  }

  async update(userId: string, id: string, dto: UpdateTrackerDto) {
    const tracker = await this.assertOwned(userId, id);

    const startDate = dto.startDate ?? tracker.startDate;
    const endDate = dto.endDate === undefined ? tracker.endDate : dto.endDate;
    this.assertDateOrder(startDate, endDate);

    // Moving the start later than something already logged would strand that entry before
    // the journey begins (and the daily page no longer lets you open dates before the start).
    if (dto.startDate != null) {
      const earliest = await this.prisma.trackerEntry.findFirst({
        where: { trackerId: id },
        orderBy: { date: 'asc' },
      });
      if (earliest && dayOf(earliest.date) < dayOf(dto.startDate)) {
        throw new BadRequestException(
          `You already have entries from ${dayOf(earliest.date)}, so the start date can't be later than that`,
        );
      }
    }

    return this.prisma.journeyTracker.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name }),
        ...(dto.startDate != null && { startDate: new Date(dto.startDate) }),
        // null clears the end date; undefined leaves it alone.
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.baseline != null && { baseline: dto.baseline }),
        ...(dto.targets != null && { targets: dto.targets }),
        ...(dto.settings != null && { settings: dto.settings }),
        ...(dto.status != null && { status: dto.status as any }),
      } as any,
    });
  }

  async archive(userId: string, id: string) {
    await this.assertOwned(userId, id);
    return this.prisma.journeyTracker.update({
      where: { id },
      data: { status: 'ARCHIVED' } as any,
    });
  }

  async activate(userId: string, id: string) {
    const tracker = await this.assertOwned(userId, id);
    if (tracker.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot activate an archived tracker');
    }
    return this.prisma.journeyTracker.update({ where: { id }, data: { status: 'ACTIVE' } as any });
  }

  async previewWeightLossTemplate(userId: string) {
    const [user, latestBodyComp, diet, supplements, hydration, exercise] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      this.prisma.dietPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.supplementPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.hydrationPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.exercisePlan.findFirst({ where: { userId, isActive: true } }),
    ]);

    return buildWeightLossTemplate({
      user,
      latestBodyComp,
      hasDiet: !!diet,
      hasSupplements: !!supplements,
      hasHydration: !!hydration,
      hydrationTargetMl: hydration?.dailyTarget,
      hasExercise: !!exercise,
    });
  }

  async addField(userId: string, trackerId: string, dto: CreateFieldDto) {
    await this.assertOwned(userId, trackerId);
    const data = {
      label: dto.label,
      type: dto.type as any,
      unit: dto.unit,
      options: dto.options,
      target: dto.target,
      required: dto.required ?? false,
      chartable: dto.chartable ?? false,
      scoringWeight: dto.scoringWeight,
      cadence: (dto.cadence as any) ?? 'DAILY',
      sortOrder: dto.sortOrder ?? 0,
    };

    // Removing a field only deactivates it (entries keep their values under its key), so
    // the (trackerId, key) unique index still holds that key. Re-adding it restores the
    // field — and its history — instead of failing on the duplicate key.
    const existing = await this.prisma.trackerField.findFirst({
      where: { trackerId, key: dto.key },
    });
    if (existing) {
      if (existing.isActive) {
        throw new ConflictException(`This tracker already has a field with key "${dto.key}"`);
      }
      return this.prisma.trackerField.update({
        where: { id: existing.id },
        data: { ...data, isActive: true },
      });
    }

    return this.prisma.trackerField.create({
      data: { trackerId, key: dto.key, ...data } as any,
    });
  }

  private async assertFieldOwned(userId: string, trackerId: string, fieldId: string) {
    await this.assertOwned(userId, trackerId);
    const field = await this.prisma.trackerField.findFirst({ where: { id: fieldId, trackerId } });
    if (!field) throw new NotFoundException('Field not found');
    return field;
  }

  async updateField(userId: string, trackerId: string, fieldId: string, dto: UpdateFieldDto) {
    await this.assertFieldOwned(userId, trackerId, fieldId);
    return this.prisma.trackerField.update({
      where: { id: fieldId },
      data: dto as any,
    });
  }

  async removeField(userId: string, trackerId: string, fieldId: string) {
    await this.assertFieldOwned(userId, trackerId, fieldId);
    return this.prisma.trackerField.update({ where: { id: fieldId }, data: { isActive: false } });
  }

  async reorderFields(userId: string, trackerId: string, dto: ReorderFieldsDto) {
    await this.assertOwned(userId, trackerId);
    await Promise.all(
      dto.order.map((item) =>
        this.prisma.trackerField.update({
          where: { id: item.fieldId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return this.getOne(userId, trackerId);
  }
}

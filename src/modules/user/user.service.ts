import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateProfileDto,
  CreateMedicalConditionDto,
  CreateFamilyHistoryDto,
  CreateTreatmentDto,
  UpdateLifestyleDto,
  UpdateGoalsDto,
} from './dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lifestyleProfile: true, emergencyContacts: true },
    });
    if (!user) throw new NotFoundException();
    const { passwordHash, twoFactorSecret, ...profile } = user;
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, dob: dto.dob ? new Date(dto.dob) : undefined },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        dob: true,
        gender: true,
        bloodGroup: true,
      },
    });
  }

  async getMedicalConditions(userId: string) {
    return this.prisma.medicalCondition.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createMedicalCondition(userId: string, dto: CreateMedicalConditionDto) {
    return this.prisma.medicalCondition.create({
      data: {
        userId,
        condition: dto.condition,
        type: dto.type as any,
        severity: dto.severity as any,
        diagnosedDate: dto.diagnosedDate ? new Date(dto.diagnosedDate) : undefined,
        notes: dto.notes,
      } as any,
    });
  }

  async getFamilyHistory(userId: string) {
    return this.prisma.familyHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFamilyHistory(userId: string, dto: CreateFamilyHistoryDto) {
    return this.prisma.familyHistory.create({
      data: { userId, ...dto } as any,
    });
  }

  async getTreatments(userId: string) {
    return this.prisma.treatment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async createTreatment(userId: string, dto: CreateTreatmentDto) {
    return this.prisma.treatment.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as any,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        prescribedBy: dto.prescribedBy,
        notes: dto.notes,
      } as any,
    });
  }

  async getLifestyle(userId: string) {
    return this.prisma.lifestyleProfile.findUnique({ where: { userId } });
  }

  async updateLifestyle(userId: string, dto: UpdateLifestyleDto) {
    return this.prisma.lifestyleProfile.upsert({
      where: { userId },
      create: { userId, ...dto } as any,
      update: dto,
    });
  }

  async getGoals(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { goals: true } });
    if (!user) throw new NotFoundException();
    return user.goals ?? {};
  }

  async updateGoals(userId: string, dto: UpdateGoalsDto) {
    const current = await this.getGoals(userId);
    const goals = { ...(current as object), ...dto };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { goals },
      select: { goals: true },
    });
    return updated.goals;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EXERCISE_PLAN_PROMPT } from '../ai/prompt-templates';
import { CreateExerciseLogDto } from './dto';

@Injectable()
export class ExerciseService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async generatePlan(userId: string, goal?: string, equipmentLevel?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lifestyleProfile: true, medicalConditions: { where: { isActive: true } } },
    });
    const bodyComp = await this.prisma.bodyComposition.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });

    const context = JSON.stringify({ user, bodyComp });
    const prompt = EXERCISE_PLAN_PROMPT.replace('{{context}}', context)
      .replace('{{goal}}', goal || 'general fitness')
      .replace('{{equipment}}', equipmentLevel || 'minimal')
      .replace('{{fitnessLevel}}', user?.lifestyleProfile?.activityLevel || 'moderate');

    const response = await this.aiService.generateCompletion(
      'You are a fitness specialist.',
      prompt,
    );

    await this.prisma.exercisePlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.exercisePlan.create({
      data: { userId, goal, weeklySchedule: response, equipmentLevel, isActive: true } as any,
    });
  }

  async getCurrentPlan(userId: string) {
    return this.prisma.exercisePlan.findFirst({ where: { userId, isActive: true } });
  }

  async updatePlan(userId: string, data: any) {
    const plan = await this.prisma.exercisePlan.findFirst({ where: { userId, isActive: true } });
    if (!plan) return null;
    return this.prisma.exercisePlan.update({ where: { id: plan.id }, data });
  }

  async createLog(userId: string, dto: CreateExerciseLogDto) {
    return this.prisma.exerciseLog.create({
      data: { userId, ...dto, date: new Date(dto.date) } as any,
    });
  }

  async getLogs(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.exerciseLog.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getStats(userId: string) {
    const logs = await this.prisma.exerciseLog.findMany({
      where: { userId, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    return {
      totalSessions: logs.length,
      totalMinutes: logs.reduce((sum, l) => sum + (l.duration || 0), 0),
      avgHeartRate: logs
        .filter((l) => l.heartRateAvg)
        .reduce((sum, l, _, arr) => sum + (l.heartRateAvg || 0) / arr.length, 0),
      byType: logs.reduce(
        (acc, l) => {
          acc[l.exerciseType] = (acc[l.exerciseType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}

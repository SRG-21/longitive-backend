import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSleepLogDto, CreateMoodLogDto } from './dto';

@Injectable()
export class SleepService {
  constructor(private prisma: PrismaService) {}

  async createSleepLog(userId: string, dto: CreateSleepLogDto) {
    return this.prisma.sleepLog.create({
      data: {
        userId,
        date: new Date(dto.date),
        bedtime: dto.bedtime ? new Date(dto.bedtime) : undefined,
        wakeTime: dto.wakeTime ? new Date(dto.wakeTime) : undefined,
        duration: dto.duration,
        quality: dto.quality,
        notes: dto.notes,
      } as any,
    });
  }

  async getSleepLogs(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.sleepLog.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getSleepScore(userId: string) {
    const logs = await this.prisma.sleepLog.findMany({
      where: { userId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { date: 'desc' },
    });
    if (!logs.length) return { score: 0, avgDuration: 0, avgQuality: 0 };

    const avgDuration = logs.reduce((s, l) => s + (l.duration || 0), 0) / logs.length;
    const avgQuality = logs.reduce((s, l) => s + (l.quality || 0), 0) / logs.length;
    const durationScore = Math.min(100, (avgDuration / 8) * 100);
    const qualityScore = avgQuality * 10;
    const score = Math.round((durationScore + qualityScore) / 2);

    return {
      score,
      avgDuration: Math.round(avgDuration * 10) / 10,
      avgQuality: Math.round(avgQuality * 10) / 10,
    };
  }

  async createMoodLog(userId: string, dto: CreateMoodLogDto) {
    return this.prisma.moodLog.create({
      data: {
        userId,
        date: new Date(dto.date),
        mood: dto.mood,
        energy: dto.energy,
        stressLevel: dto.stressLevel,
        notes: dto.notes,
      } as any,
    });
  }

  async getMoodLogs(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.moodLog.findMany({ where, orderBy: { date: 'desc' } });
  }
}

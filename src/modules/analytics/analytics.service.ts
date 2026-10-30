import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getHealthScore(userId: string) {
    const [bodyComp, sleepLogs, exerciseLogs, checklist, moodLogs] = await Promise.all([
      this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      this.prisma.sleepLog.findMany({
        where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      this.prisma.exerciseLog.findMany({
        where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      this.prisma.dailyChecklist.findMany({
        where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
      this.prisma.moodLog.findMany({
        where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
      }),
    ]);

    const scores: Record<string, number> = {};

    // BMI score (18.5-24.9 is ideal)
    if (bodyComp?.bmi) {
      scores.bmi =
        bodyComp.bmi >= 18.5 && bodyComp.bmi <= 24.9
          ? 100
          : Math.max(0, 100 - Math.abs(bodyComp.bmi - 22) * 10);
    }

    // Sleep score
    if (sleepLogs.length) {
      const avgQuality = sleepLogs.reduce((s, l) => s + (l.quality || 5), 0) / sleepLogs.length;
      scores.sleep = avgQuality * 10;
    }

    // Exercise score (target: 4+ sessions/week)
    scores.exercise = Math.min(100, (exerciseLogs.length / 4) * 100);

    // Adherence score
    if (checklist.length) {
      const totalItems = checklist.reduce((s, c) => s + ((c.items as any[])?.length || 0), 0);
      const completedItems = checklist.reduce(
        (s, c) => s + ((c.items as any[])?.filter((i) => i.completed).length || 0),
        0,
      );
      scores.adherence = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;
    }

    // Mood score
    if (moodLogs.length) {
      const avgMood = moodLogs.reduce((s, l) => s + (l.mood || 5), 0) / moodLogs.length;
      scores.mood = avgMood * 10;
    }

    const overall = Object.values(scores).length
      ? Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length)
      : 0;

    return { overall, breakdown: scores };
  }

  async getDashboard(userId: string) {
    const [healthScore, streak, bodyComp, recentLabs] = await Promise.all([
      this.getHealthScore(userId),
      this.prisma.progressStreak.findUnique({ where: { userId } }),
      this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      this.prisma.labReport.findMany({
        where: { userId },
        orderBy: { reportDate: 'desc' },
        take: 3,
        include: { results: true },
      }),
    ]);

    return { healthScore, streak, latestBodyComp: bodyComp, recentLabReports: recentLabs };
  }
}

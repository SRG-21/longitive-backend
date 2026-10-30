import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getStreaks(userId: string) {
    return this.prisma.progressStreak.findUnique({ where: { userId } });
  }

  async getScore(userId: string, date: string) {
    const checklist = await this.prisma.dailyChecklist.findUnique({
      where: { userId_date: { userId, date: new Date(date) } },
    });
    if (!checklist || !checklist.items) return { score: 0, total: 0, percentage: 0 };

    const items = checklist.items as any[];
    const completed = items.filter((i) => i.completed).length;
    return {
      score: completed,
      total: items.length,
      percentage: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
    };
  }

  async getWeeklyReport(userId: string) {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const checklists = await this.prisma.dailyChecklist.findMany({
      where: { userId, date: { gte: weekAgo, lte: today } },
      orderBy: { date: 'asc' },
    });

    const dailyScores = checklists.map((c) => {
      const items = (c.items as any[]) || [];
      const completed = items.filter((i) => i.completed).length;
      return {
        date: c.date,
        score: items.length ? Math.round((completed / items.length) * 100) : 0,
      };
    });

    const avgScore = dailyScores.length
      ? Math.round(dailyScores.reduce((s, d) => s + d.score, 0) / dailyScores.length)
      : 0;

    return { dailyScores, averageScore: avgScore, daysTracked: checklists.length };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ChecklistService {
  constructor(private prisma: PrismaService) {}

  async getDaily(userId: string, date: string) {
    let checklist = await this.prisma.dailyChecklist.findUnique({
      where: { userId_date: { userId, date: new Date(date) } },
    });
    if (!checklist) {
      // Generate default checklist from active plans
      const items = await this.generateDefaultItems(userId);
      checklist = await this.prisma.dailyChecklist.create({
        data: { userId, date: new Date(date), items } as any,
      });
    }
    return checklist;
  }

  async updateDaily(userId: string, date: string, items: any[]) {
    const checklist = await this.prisma.dailyChecklist.upsert({
      where: { userId_date: { userId, date: new Date(date) } },
      create: { userId, date: new Date(date), items } as any,
      update: { items },
    });

    // Update streak
    const allCompleted = items.every((item: any) => item.completed);
    if (allCompleted) {
      await this.updateStreak(userId);
    }

    return checklist;
  }

  private async updateStreak(userId: string) {
    const streak = await this.prisma.progressStreak.upsert({
      where: { userId },
      create: { userId, currentStreak: 1, longestStreak: 1, lastCompletedDate: new Date() } as any,
      update: {},
    });

    const lastDate = streak.lastCompletedDate;
    const today = new Date();
    const diffDays = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / 86400000) : 2;

    let newStreak = streak.currentStreak;
    if (diffDays <= 1) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    await this.prisma.progressStreak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, streak.longestStreak),
        lastCompletedDate: today,
      },
    });
  }

  private async generateDefaultItems(userId: string) {
    const items: any[] = [];
    const [diet, supplements, hydration, exercise] = await Promise.all([
      this.prisma.dietPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.supplementPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.hydrationPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.exercisePlan.findFirst({ where: { userId, isActive: true } }),
    ]);

    if (diet) items.push({ task: 'Follow diet plan', completed: false });
    if (supplements) items.push({ task: 'Take supplements', completed: false });
    if (hydration) items.push({ task: `Drink ${hydration.dailyTarget}ml water`, completed: false });
    if (exercise) items.push({ task: 'Complete workout', completed: false });
    items.push({ task: 'Log sleep', completed: false });
    items.push({ task: 'Log mood', completed: false });

    return items;
  }
}

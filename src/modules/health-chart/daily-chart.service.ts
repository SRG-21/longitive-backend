import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DailyChartService {
  constructor(private prisma: PrismaService) {}

  async getDaily(userId: string, date: string) {
    return this.prisma.dailyChart.findUnique({
      where: { userId_date: { userId, date: new Date(date) } },
    });
  }

  async generate(userId: string, date: string) {
    const [diet, supplements, hydration, exercise] = await Promise.all([
      this.prisma.dietPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.supplementPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.hydrationPlan.findFirst({ where: { userId, isActive: true } }),
      this.prisma.exercisePlan.findFirst({ where: { userId, isActive: true } }),
    ]);

    const schedule = this.buildDailySchedule(diet, supplements, hydration, exercise);

    return this.prisma.dailyChart.upsert({
      where: { userId_date: { userId, date: new Date(date) } },
      create: { userId, date: new Date(date), schedule } as any,
      update: { schedule },
    });
  }

  private buildDailySchedule(diet: any, supplements: any, hydration: any, exercise: any) {
    const items: any[] = [];

    // Add hydration reminders
    if (hydration?.schedule) {
      for (const h of hydration.schedule as any[]) {
        items.push({ time: h.time, activity: 'hydration', detail: `Drink ${h.amount}ml water` });
      }
    }

    // Add meals from diet plan
    items.push({ time: '07:00', activity: 'meal', detail: 'Breakfast' });
    items.push({ time: '10:00', activity: 'snack', detail: 'Morning Snack' });
    items.push({ time: '13:00', activity: 'meal', detail: 'Lunch' });
    items.push({ time: '16:00', activity: 'snack', detail: 'Afternoon Snack' });
    items.push({ time: '19:00', activity: 'meal', detail: 'Dinner' });

    // Add supplements
    if (supplements) {
      items.push({ time: '07:30', activity: 'supplement', detail: 'Morning supplements' });
      items.push({ time: '21:00', activity: 'supplement', detail: 'Evening supplements' });
    }

    // Add exercise
    if (exercise) {
      items.push({ time: '06:00', activity: 'exercise', detail: 'Workout' });
    }

    return items.sort((a, b) => a.time.localeCompare(b.time));
  }
}

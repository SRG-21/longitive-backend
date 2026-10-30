import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HydrationService {
  constructor(private prisma: PrismaService) {}

  async generate(userId: string, dailyTarget?: number) {
    const target = dailyTarget || 3000; // ml
    const schedule = this.buildSchedule(target);

    await this.prisma.hydrationPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.hydrationPlan.create({
      data: { userId, dailyTarget: target, schedule, isActive: true } as any,
    });
  }

  async getCurrent(userId: string) {
    return this.prisma.hydrationPlan.findFirst({ where: { userId, isActive: true } });
  }

  private buildSchedule(target: number) {
    const glasses = Math.ceil(target / 250);
    const wakeHour = 6;
    const sleepHour = 22;
    const interval = (sleepHour - wakeHour) / glasses;
    const schedule = [];
    for (let i = 0; i < glasses; i++) {
      const hour = Math.round(wakeHour + i * interval);
      schedule.push({ time: `${hour.toString().padStart(2, '0')}:00`, amount: 250, unit: 'ml' });
    }
    return schedule;
  }
}

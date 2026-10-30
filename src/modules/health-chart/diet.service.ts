import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { DIET_PLAN_PROMPT } from '../ai/prompt-templates';

@Injectable()
export class DietService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async generate(userId: string, preferences?: any, targetCalories?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lifestyleProfile: true, medicalConditions: { where: { isActive: true } } },
    });

    const prompt = DIET_PLAN_PROMPT.replace('{{context}}', JSON.stringify(user))
      .replace('{{preferences}}', JSON.stringify(preferences || {}))
      .replace('{{targetCalories}}', String(targetCalories || 2000));

    const response = await this.aiService.generateCompletion(
      'You are a nutrition specialist.',
      prompt,
    );

    // Deactivate old plans
    await this.prisma.dietPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.dietPlan.create({
      data: {
        userId,
        preferences,
        targetCalories,
        meals: response,
        isActive: true,
        startDate: new Date(),
      } as any,
    });
  }

  async getCurrent(userId: string) {
    return this.prisma.dietPlan.findFirst({ where: { userId, isActive: true } });
  }

  async update(userId: string, data: any) {
    const plan = await this.prisma.dietPlan.findFirst({ where: { userId, isActive: true } });
    if (!plan) return null;
    return this.prisma.dietPlan.update({ where: { id: plan.id }, data });
  }
}

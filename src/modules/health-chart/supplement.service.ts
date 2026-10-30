import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SUPPLEMENT_PROMPT } from '../ai/prompt-templates';

@Injectable()
export class SupplementService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async generate(userId: string) {
    const [user, conditions, labs] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { lifestyleProfile: true } }),
      this.prisma.medicalCondition.findMany({ where: { userId, isActive: true } }),
      this.prisma.labTestResult.findMany({
        where: { report: { userId } },
        orderBy: { report: { reportDate: 'desc' } },
        take: 20,
      }),
    ]);

    const context = JSON.stringify({ user, conditions, labs });
    const prompt = SUPPLEMENT_PROMPT.replace('{{context}}', context);
    const response = await this.aiService.generateCompletion(
      'You are a supplement specialist.',
      prompt,
    );

    await this.prisma.supplementPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.supplementPlan.create({
      data: { userId, supplements: response, isActive: true } as any,
    });
  }

  async getCurrent(userId: string) {
    return this.prisma.supplementPlan.findFirst({ where: { userId, isActive: true } });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import { LONGEVITY_INSIGHTS_PROMPT, BIOLOGICAL_AGE_PROMPT } from './prompt-templates';

@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async generateInsights(userId: string) {
    const context = await this.buildContext(userId);
    const prompt = LONGEVITY_INSIGHTS_PROMPT.replace('{{context}}', context);

    const response = await this.aiService.generateCompletion(
      'You are a longevity medicine specialist. Return valid JSON array.',
      prompt,
    );

    try {
      const insights = JSON.parse(response);
      const created = [];
      for (const insight of insights) {
        const record = await this.prisma.aiInsight.create({
          data: {
            userId,
            type: insight.type,
            content: insight.content,
            priority: insight.priority || 0,
            dataPoints: insight.dataPoints,
          } as any,
        });
        created.push(record);
      }
      return created;
    } catch {
      // If AI didn't return valid JSON, store as single insight
      return this.prisma.aiInsight.create({
        data: { userId, type: 'general', content: response, priority: 1 } as any,
      });
    }
  }

  async getInsights(userId: string) {
    return this.prisma.aiInsight.findMany({
      where: { userId },
      orderBy: [{ isPinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async pinInsight(userId: string, insightId: string) {
    return this.prisma.aiInsight.updateMany({
      where: { id: insightId, userId },
      data: { isPinned: true },
    });
  }

  async getBiologicalAge(userId: string) {
    const context = await this.buildContext(userId);
    const prompt = BIOLOGICAL_AGE_PROMPT.replace('{{context}}', context);
    const response = await this.aiService.generateCompletion(
      'You are a biological age assessment specialist. Return structured analysis.',
      prompt,
    );
    return { analysis: response };
  }

  private async buildContext(userId: string): Promise<string> {
    const [user, conditions, bodyComps, labResults] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { lifestyleProfile: true, familyHistory: true },
      }),
      this.prisma.medicalCondition.findMany({ where: { userId, isActive: true } }),
      this.prisma.bodyComposition.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 5,
      }),
      this.prisma.labTestResult.findMany({
        where: { report: { userId } },
        orderBy: { report: { reportDate: 'desc' } },
        take: 30,
        include: { report: { select: { reportDate: true } } },
      }),
    ]);

    return JSON.stringify(
      {
        user: user?.name,
        age: user?.dob,
        conditions,
        bodyComps,
        labResults,
        lifestyle: user?.lifestyleProfile,
        familyHistory: user?.familyHistory,
      },
      null,
      2,
    );
  }
}

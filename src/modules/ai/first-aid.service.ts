import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import { FIRST_AID_PROMPT } from './prompt-templates';

@Injectable()
export class FirstAidService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async processIncident(userId: string, description: string) {
    const context = await this.buildContext(userId);
    const prompt = FIRST_AID_PROMPT.replace('{{context}}', context).replace(
      '{{symptoms}}',
      description,
    );

    const response = await this.aiService.generateCompletion(
      'You are an emergency health guidance AI. Prioritize patient safety.',
      prompt,
    );

    // Parse severity from response
    let severity: 'GREEN' | 'YELLOW' | 'RED' = 'YELLOW';
    if (response.includes('RED') || response.includes('emergency')) severity = 'RED';
    else if (response.includes('GREEN') || response.includes('home')) severity = 'GREEN';

    const incident = await this.prisma.healthIncident.create({
      data: {
        userId,
        description,
        severity,
        aiResponse: response,
        actions: { raw: response },
      } as any,
    });

    return incident;
  }

  async getHistory(userId: string) {
    return this.prisma.healthIncident.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private async buildContext(userId: string): Promise<string> {
    const [user, conditions, treatments] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.medicalCondition.findMany({ where: { userId, isActive: true } }),
      this.prisma.treatment.findMany({ where: { userId, isActive: true } }),
    ]);

    const parts = [];
    if (user)
      parts.push(
        `Patient: ${user.name}, ${user.gender}, Age: ${user.dob}, Blood: ${user.bloodGroup}`,
      );
    if (conditions.length)
      parts.push(
        `Conditions: ${conditions.map((c) => `${c.condition} (${c.type}, severity: ${c.severity})`).join(', ')}`,
      );
    if (treatments.length)
      parts.push(`Current Meds/Treatments: ${treatments.map((t) => t.name).join(', ')}`);
    return parts.join('\n');
  }
}

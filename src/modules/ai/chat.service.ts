import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import { CHAT_SYSTEM_PROMPT, CHAT_SUMMARIZATION_PROMPT } from './prompt-templates';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async sendMessage(userId: string, message: string, sessionId?: string) {
    // Get or create session
    let session: any;
    if (sessionId) {
      session = await this.prisma.aiChatSession.findFirst({ where: { id: sessionId, userId } });
    }
    if (!session) {
      session = await this.prisma.aiChatSession.create({
        data: { userId, title: message.substring(0, 50) } as any,
      });
    }

    // Save user message
    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: 'USER', content: message } as any,
    });

    // Build context
    const context = await this.buildPatientContext(userId);
    const systemPrompt = CHAT_SYSTEM_PROMPT.replace('{{context}}', context);

    // Get recent messages for conversation continuity
    const recentMessages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.reverse().map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content,
      })),
    ];

    const response = await this.aiService.generateChatCompletion(messages);

    // Save assistant response
    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: 'ASSISTANT', content: response } as any,
    });

    return { sessionId: session.id, response };
  }

  async getSessions(userId: string) {
    return this.prisma.aiChatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getSession(userId: string, sessionId: string) {
    return this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async summarizeSession(userId: string, sessionId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) return null;

    const messagesText = session.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');

    const prompt = CHAT_SUMMARIZATION_PROMPT.replace('{{messages}}', messagesText);
    const summary = await this.aiService.generateCompletion(
      'You are a medical conversation summarizer.',
      prompt,
    );

    await this.prisma.aiChatSession.update({
      where: { id: sessionId },
      data: { summary },
    });

    return { sessionId, summary };
  }

  private async buildPatientContext(userId: string): Promise<string> {
    const [user, conditions, treatments, bodyComp, labResults] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { lifestyleProfile: true, familyHistory: true },
      }),
      this.prisma.medicalCondition.findMany({ where: { userId, isActive: true } }),
      this.prisma.treatment.findMany({ where: { userId, isActive: true } }),
      this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      this.prisma.labTestResult.findMany({
        where: { report: { userId } },
        orderBy: { report: { reportDate: 'desc' } },
        take: 20,
        include: { report: { select: { reportDate: true } } },
      }),
    ]);

    const parts: string[] = [];
    if (user) {
      parts.push(
        `Patient: ${user.name}, ${user.gender || 'unknown'}, DOB: ${user.dob || 'unknown'}, Blood Group: ${user.bloodGroup || 'unknown'}`,
      );
    }
    if (conditions.length) {
      parts.push(
        `Active Conditions: ${conditions.map((c) => `${c.condition} (${c.type})`).join(', ')}`,
      );
    }
    if (treatments.length) {
      parts.push(
        `Current Treatments: ${treatments.map((t) => `${t.name} (${t.type})`).join(', ')}`,
      );
    }
    if (user?.familyHistory?.length) {
      parts.push(
        `Family History: ${user.familyHistory.map((f) => `${f.relation}: ${f.condition}`).join(', ')}`,
      );
    }
    if (bodyComp) {
      parts.push(
        `Latest Body Comp (${bodyComp.date.toISOString().split('T')[0]}): Weight ${bodyComp.weight}kg, BMI ${bodyComp.bmi}, Body Fat ${bodyComp.bodyFat}%, Muscle Mass ${bodyComp.muscleMass}kg`,
      );
    }
    if (labResults.length) {
      parts.push(
        `Recent Labs: ${labResults.map((r) => `${r.testName}: ${r.value} ${r.unit || ''} (${r.status})`).join(', ')}`,
      );
    }
    if (user?.lifestyleProfile) {
      const lp = user.lifestyleProfile;
      parts.push(
        `Lifestyle: Activity ${lp.activityLevel}, Sleep ${lp.sleepHours}h, Stress ${lp.stressLevel}/10`,
      );
    }

    return parts.join('\n');
  }
}

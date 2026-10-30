import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MistralOcrService } from '../ocr/mistral-ocr.service';
import { CreateBodyCompositionDto } from './dto';

@Injectable()
export class BodyCompositionService {
  constructor(
    private prisma: PrismaService,
    private ocrService: MistralOcrService,
  ) {}

  async createFromOcrUpload(userId: string, buffer: Buffer, filename: string, contentType: string) {
    const extraction = await this.ocrService.processBodyComposition(buffer, filename, contentType);
    if (!extraction.data) {
      throw new UnprocessableEntityException('Could not extract body composition data from this file');
    }
    return this.createFromOcr(userId, {
      ...extraction.data,
      rawOcrText: extraction.rawText,
      sourceImageUrl: extraction.sourceUrl,
    } as any);
  }

  async create(userId: string, dto: CreateBodyCompositionDto) {
    return this.prisma.bodyComposition.create({
      data: { userId, ...dto, date: new Date(dto.date) } as any,
    });
  }

  async createFromOcr(
    userId: string,
    data: Partial<CreateBodyCompositionDto> & { rawOcrText: string },
  ) {
    return this.prisma.bodyComposition.create({
      data: {
        userId,
        date: data.date ? new Date(data.date) : new Date(),
        ...data,
        source: 'OCR',
      } as any,
    });
  }

  async getHistory(userId: string, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return this.prisma.bodyComposition.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getLatest(userId: string) {
    return this.prisma.bodyComposition.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
  }

  async getTrends(userId: string) {
    const records = await this.prisma.bodyComposition.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      take: 50,
    });

    if (records.length < 2) return { records, trends: {} };

    const latest = records[records.length - 1];
    const previous = records[records.length - 2];
    const metrics = ['weight', 'bmi', 'bodyFat', 'muscleMass', 'visceralFat'] as const;
    const trends: Record<string, { change: number; direction: string }> = {};

    for (const metric of metrics) {
      const curr = latest[metric] as number | null;
      const prev = previous[metric] as number | null;
      if (curr != null && prev != null) {
        const change = curr - prev;
        trends[metric] = {
          change: Math.round(change * 100) / 100,
          direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        };
      }
    }

    return { records, trends };
  }

  async compare(userId: string, dates: string[]) {
    return this.prisma.bodyComposition.findMany({
      where: { userId, date: { in: dates.map((d) => new Date(d)) } },
      orderBy: { date: 'asc' },
    });
  }
}

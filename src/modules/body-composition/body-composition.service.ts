import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MistralOcrService } from '../ocr/mistral-ocr.service';
import { CreateBodyCompositionDto } from './dto';
import { toInt, toNumber } from '../ocr/ocr-values';

// Int columns in the schema; OCR may read them as decimals ("72.0"), so they're rounded.
const INT_FIELDS = [
  'metabolicAge',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'heartRate',
] as const;
const FLOAT_FIELDS = [
  'height',
  'weight',
  'bmi',
  'bodyFat',
  'visceralFat',
  'subcutaneousFat',
  'muscleMass',
  'boneMass',
  'bodyWater',
  'bmr',
  'waist',
  'hip',
  'chest',
  'spo2',
] as const;

@Injectable()
export class BodyCompositionService {
  constructor(
    private prisma: PrismaService,
    private ocrService: MistralOcrService,
  ) {}

  /**
   * Scans a body-analyzer printout or screenshot with Mistral OCR and saves the measurement.
   * Uploading the same file again returns the existing measurement instead of scanning again.
   */
  async createFromOcrUpload(userId: string, buffer: Buffer, contentType: string) {
    const file = this.ocrService.describeFile(buffer, contentType, 'body-composition', userId);
    const existing = await this.prisma.bodyComposition.findFirst({
      where: { userId, fileSha256: file.fileSha256 },
    });
    if (existing) return { ...existing, alreadyUploaded: true };

    const run = await this.ocrService.processBodyComposition(buffer, contentType, file);
    const raw = (run.annotation ?? {}) as Record<string, unknown>;
    const values = Object.fromEntries(
      [
        ...FLOAT_FIELDS.map((k) => [k, toNumber(raw[k])] as const),
        ...INT_FIELDS.map((k) => [k, toInt(raw[k])] as const),
      ].filter(([, v]) => v != null),
    );
    if (!Object.keys(values).length) {
      throw new UnprocessableEntityException(
        'Could not find any body composition values in this file',
      );
    }

    const measurement = await this.prisma.bodyComposition.create({
      data: {
        userId,
        date: new Date(),
        ...values,
        source: 'OCR',
        rawOcrText: run.rawText,
        fileKey: run.fileKey,
        fileSha256: run.fileSha256,
        ocrModel: run.model,
        ocrPages: run.pageCount,
        ocrMs: run.elapsedMs,
        ocrCostUsd: run.costUsd,
        ocrSchemaVersion: run.schemaVersion,
      } as any,
    });
    return { ...measurement, alreadyUploaded: false };
  }

  async create(userId: string, dto: CreateBodyCompositionDto) {
    return this.prisma.bodyComposition.create({
      data: { userId, ...dto, date: new Date(dto.date) } as any,
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

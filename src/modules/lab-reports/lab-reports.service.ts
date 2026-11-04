import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MistralOcrService } from '../ocr/mistral-ocr.service';
import { CreateLabReportDto, LabReportQueryDto } from './dto';
import { tenantContext } from '../../common/context/tenant-context';
import { statusFromRange, toDay, toNumber, toText } from '../ocr/ocr-values';

@Injectable()
export class LabReportsService {
  constructor(
    private prisma: PrismaService,
    private ocrService: MistralOcrService,
  ) {}

  // Nested relation writes (results: { create: [...] }) aren't visited by the
  // PrismaService tenant-scoping extension (it only sees the root operation),
  // so LabTestResult rows need tenantId set explicitly here.
  private get currentTenantId(): string {
    const tenantId = tenantContext.getStore()?.tenantId;
    if (!tenantId) throw new Error('Lab report writes require an authenticated tenant context');
    return tenantId;
  }

  async create(userId: string, dto: CreateLabReportDto) {
    return this.prisma.labReport.create({
      data: {
        userId,
        reportDate: new Date(dto.reportDate),
        labName: dto.labName,
        reportType: dto.reportType,
        results: {
          create: dto.results.map((r) => ({
            tenantId: this.currentTenantId,
            testName: r.testName,
            category: r.category,
            value: r.value,
            unit: r.unit,
            referenceMin: r.referenceMin,
            referenceMax: r.referenceMax,
            status: (r.status as any) || 'NORMAL',
            notes: r.notes,
          })),
        },
      } as any,
      include: { results: true },
    });
  }

  /**
   * Scans a lab report (photo or PDF) with Mistral OCR and saves its results, unverified, for
   * the user to review. Uploading the same file again returns the existing report instead of
   * paying for another OCR call.
   */
  async processMistralOcr(userId: string, buffer: Buffer, contentType: string) {
    const file = this.ocrService.describeFile(buffer, contentType, 'lab-reports', userId);
    const existing = await this.prisma.labReport.findFirst({
      where: { userId, fileSha256: file.fileSha256 },
      include: { results: true },
    });
    if (existing) return { ...existing, alreadyUploaded: true };

    const run = await this.ocrService.processLabReport(buffer, contentType, file);
    const tenantId = this.currentTenantId;
    const results = (run.annotation?.results ?? []).flatMap((r) => {
      const testName = toText(r?.testName);
      const value = toNumber(r?.value);
      if (!testName || value == null) return [];
      const referenceMin = toNumber(r.referenceMin);
      const referenceMax = toNumber(r.referenceMax);
      return [
        {
          tenantId,
          testName,
          value,
          unit: toText(r.unit) ?? undefined,
          referenceMin: referenceMin ?? undefined,
          referenceMax: referenceMax ?? undefined,
          category: toText(r.category) ?? undefined,
          status: statusFromRange(value, referenceMin, referenceMax),
        },
      ];
    });
    if (!results.length) {
      throw new UnprocessableEntityException('Could not find any lab results in this file');
    }

    const reportDay = toDay(run.annotation?.reportDate);
    const report = await this.prisma.labReport.create({
      data: {
        userId,
        reportDate: reportDay ? new Date(reportDay) : new Date(),
        labName: toText(run.annotation?.labName) ?? undefined,
        reportType: 'ocr-extracted',
        source: 'OCR',
        rawOcrText: run.rawText,
        verified: false,
        fileKey: run.fileKey,
        fileSha256: run.fileSha256,
        ocrModel: run.model,
        ocrPages: run.pageCount,
        ocrMs: run.elapsedMs,
        ocrCostUsd: run.costUsd,
        ocrSchemaVersion: run.schemaVersion,
        results: { create: results },
      } as any,
      include: { results: true },
    });
    return { ...report, alreadyUploaded: false };
  }

  /** A short-lived link to the uploaded original, for its owner only. */
  async getFileUrl(userId: string, id: string) {
    const report = await this.findOne(userId, id);
    if (report.fileKey) return { url: await this.ocrService.presignedUrl(report.fileKey) };
    if (report.fileUrl) return { url: report.fileUrl }; // reports scanned before files were private
    throw new NotFoundException('This report has no uploaded file');
  }

  async findAll(userId: string, query: LabReportQueryDto) {
    const where: any = { userId };
    if (query.from || query.to) {
      where.reportDate = {};
      if (query.from) where.reportDate.gte = new Date(query.from);
      if (query.to) where.reportDate.lte = new Date(query.to);
    }
    if (query.category) {
      where.results = { some: { category: query.category } };
    }
    return this.prisma.labReport.findMany({
      where,
      include: { results: true },
      orderBy: { reportDate: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const report = await this.prisma.labReport.findFirst({
      where: { id, userId },
      include: { results: true },
    });
    if (!report) throw new NotFoundException();
    return report;
  }

  async verify(userId: string, id: string) {
    const report = await this.findOne(userId, id);
    return this.prisma.labReport.update({
      where: { id: report.id },
      data: { verified: true },
      include: { results: true },
    });
  }

  async getSpreadsheet(userId: string, tests: string[], from?: string, to?: string) {
    const where: any = { report: { userId }, testName: { in: tests } };
    if (from || to) {
      where.report.reportDate = {};
      if (from) where.report.reportDate.gte = new Date(from);
      if (to) where.report.reportDate.lte = new Date(to);
    }

    const results = await this.prisma.labTestResult.findMany({
      where,
      include: { report: { select: { reportDate: true, labName: true } } },
      orderBy: { report: { reportDate: 'asc' } },
    });

    // Pivot: rows = dates, columns = tests
    const pivot: Record<string, Record<string, any>> = {};
    for (const r of results) {
      const dateKey = r.report.reportDate.toISOString().split('T')[0];
      if (!pivot[dateKey]) pivot[dateKey] = { date: dateKey };
      pivot[dateKey][r.testName] = { value: r.value, unit: r.unit, status: r.status };
    }
    return Object.values(pivot);
  }

  async getTrends(userId: string, testName: string) {
    return this.prisma.labTestResult.findMany({
      where: { testName, report: { userId } },
      include: { report: { select: { reportDate: true } } },
      orderBy: { report: { reportDate: 'asc' } },
    });
  }
}

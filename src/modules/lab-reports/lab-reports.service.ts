import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MistralOcrService } from '../ocr/mistral-ocr.service';
import { CreateLabReportDto, LabReportQueryDto } from './dto';
import { tenantContext } from '../../common/context/tenant-context';

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

  // Mistral OCR handles both images and PDFs the same way (both go through `document_url`),
  // so /lab-reports/ocr and /lab-reports/pdf share this single implementation.
  async processMistralOcr(userId: string, buffer: Buffer, filename: string, contentType: string) {
    const extraction = await this.ocrService.processLabReport(buffer, filename, contentType);
    if (!extraction.data || extraction.data.results.length === 0) {
      throw new UnprocessableEntityException('Could not extract lab results from this file');
    }
    const tenantId = this.currentTenantId;
    const results = extraction.data.results.map((r) => ({
      tenantId,
      testName: r.testName,
      value: r.value,
      unit: r.unit ?? undefined,
      referenceMin: r.referenceMin ?? undefined,
      referenceMax: r.referenceMax ?? undefined,
      category: r.category ?? undefined,
      status: 'NORMAL' as const,
    }));

    return this.prisma.labReport.create({
      data: {
        userId,
        reportDate: extraction.data.reportDate ? new Date(extraction.data.reportDate) : new Date(),
        labName: extraction.data.labName ?? undefined,
        reportType: 'ocr-extracted',
        fileUrl: extraction.sourceUrl,
        source: 'OCR',
        rawOcrText: extraction.rawText,
        verified: false,
        results: { create: results },
      } as any,
      include: { results: true },
    });
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

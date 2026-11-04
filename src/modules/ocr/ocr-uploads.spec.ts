import { tenantContext } from '../../common/context/tenant-context';
import { LabReportsService } from '../lab-reports/lab-reports.service';
import { BodyCompositionService } from '../body-composition/body-composition.service';
import { statusFromRange, toDay, toInt, toNumber } from './ocr-values';

const file = { fileKey: 'lab-reports/u1/2026/11/abc.pdf', fileSha256: 'abc' };
const run = (annotation: unknown) => ({
  ...file,
  annotation,
  rawText: 'text',
  pageCount: 2,
  elapsedMs: 900,
  costUsd: 0.002,
  model: 'mistral-ocr-2512',
  schemaVersion: 1,
});

describe('ocr values', () => {
  it('keeps real numbers only', () => {
    expect(toNumber(5.2)).toBe(5.2);
    expect(toNumber('1,250')).toBe(1250);
    expect(toNumber(' 13.5 ')).toBe(13.5);
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toInt('72.4')).toBe(72);
  });

  it('derives status from the reference range', () => {
    expect(statusFromRange(6.1, null, 5.7)).toBe('HIGH');
    expect(statusFromRange(3, 4, 10)).toBe('LOW');
    expect(statusFromRange(5, 4, 10)).toBe('NORMAL');
    expect(statusFromRange(5, null, null)).toBe('NORMAL');
  });

  it('accepts only real calendar days', () => {
    expect(toDay('2026-10-20')).toBe('2026-10-20');
    expect(toDay('2026-02-31')).toBeNull();
    expect(toDay('20/10/2026')).toBeNull();
  });
});

describe('lab report upload', () => {
  let prisma: any;
  let ocr: any;
  let service: LabReportsService;

  beforeEach(() => {
    prisma = {
      labReport: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'r1', ...data, results: data.results.create })),
      },
    };
    ocr = {
      describeFile: jest.fn(() => file),
      processLabReport: jest.fn(),
      presignedUrl: jest.fn(async (key: string) => `https://signed/${key}`),
    };
    service = new LabReportsService(prisma, ocr);
  });

  const upload = () =>
    tenantContext.run({ tenantId: 't1' }, () =>
      service.processMistralOcr('u1', Buffer.from('x'), 'application/pdf'),
    );

  it('saves cleaned results with a status from the range, plus the OCR bookkeeping', async () => {
    ocr.processLabReport.mockResolvedValue(
      run({
        labName: 'City Lab',
        reportDate: '2026-10-20',
        results: [
          { testName: 'HbA1c', value: '6.1', unit: '%', referenceMax: 5.7, category: 'Diabetes' },
          { testName: 'LDL', value: 95, unit: 'mg/dL', referenceMin: null, referenceMax: '100' },
          { testName: 'Comment', value: 'see notes' },
          { testName: '', value: 1 },
        ],
      }),
    );
    const report: any = await upload();
    expect(report.alreadyUploaded).toBe(false);
    expect(report.results.map((r: any) => [r.testName, r.value, r.status])).toEqual([
      ['HbA1c', 6.1, 'HIGH'],
      ['LDL', 95, 'NORMAL'],
    ]);
    expect(report.results.every((r: any) => r.tenantId === 't1')).toBe(true);
    expect(report).toMatchObject({
      labName: 'City Lab',
      source: 'OCR',
      verified: false,
      fileKey: file.fileKey,
      fileSha256: 'abc',
      ocrModel: 'mistral-ocr-2512',
      ocrPages: 2,
      ocrMs: 900,
      ocrCostUsd: 0.002,
      ocrSchemaVersion: 1,
    });
    expect(report.reportDate.toISOString().startsWith('2026-10-20')).toBe(true);
    expect(report.fileUrl).toBeUndefined();
  });

  it('returns the existing report for a re-upload without calling OCR', async () => {
    prisma.labReport.findFirst.mockResolvedValue({ id: 'r0', results: [] });
    expect(await upload()).toMatchObject({ id: 'r0', alreadyUploaded: true });
    expect(ocr.processLabReport).not.toHaveBeenCalled();
    expect(prisma.labReport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', fileSha256: 'abc' } }),
    );
  });

  it('refuses a file with no usable results', async () => {
    ocr.processLabReport.mockResolvedValue(run({ results: [{ testName: 'Note', value: 'n/a' }] }));
    await expect(upload()).rejects.toMatchObject({ status: 422 });
    expect(prisma.labReport.create).not.toHaveBeenCalled();
  });

  it('falls back to today for an unreadable report date', async () => {
    ocr.processLabReport.mockResolvedValue(
      run({ reportDate: '31/10/2026', results: [{ testName: 'Hb', value: 13 }] }),
    );
    const report: any = await upload();
    expect(Math.abs(report.reportDate.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('only gives the owner a short-lived link to the original', async () => {
    prisma.labReport.findFirst.mockImplementation(async ({ where }: any) =>
      where.userId === 'u1' ? { id: 'r1', fileKey: file.fileKey } : null,
    );
    expect(await service.getFileUrl('u1', 'r1')).toEqual({ url: `https://signed/${file.fileKey}` });
    await expect(service.getFileUrl('u2', 'r1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('body composition upload', () => {
  let prisma: any;
  let ocr: any;
  let service: BodyCompositionService;

  beforeEach(() => {
    prisma = {
      bodyComposition: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 'b1', ...data })),
      },
    };
    ocr = { describeFile: jest.fn(() => file), processBodyComposition: jest.fn() };
    service = new BodyCompositionService(prisma, ocr);
  });

  it('keeps real values, rounds the integer fields and records the OCR run', async () => {
    ocr.processBodyComposition.mockResolvedValue(
      run({
        weight: '80.4',
        bodyFat: 22.5,
        heartRate: 71.6,
        metabolicAge: '38',
        waist: null,
        bmi: 'n/a',
      }),
    );
    const m: any = await service.createFromOcrUpload('u1', Buffer.from('x'), 'image/png');
    expect(m).toMatchObject({
      weight: 80.4,
      bodyFat: 22.5,
      heartRate: 72,
      metabolicAge: 38,
      source: 'OCR',
      ocrCostUsd: 0.002,
      alreadyUploaded: false,
    });
    expect(m).not.toHaveProperty('waist');
    expect(m).not.toHaveProperty('bmi');
  });

  it('returns the existing measurement for a re-upload', async () => {
    prisma.bodyComposition.findFirst.mockResolvedValue({ id: 'b0' });
    expect(await service.createFromOcrUpload('u1', Buffer.from('x'), 'image/png')).toMatchObject({
      id: 'b0',
      alreadyUploaded: true,
    });
    expect(ocr.processBodyComposition).not.toHaveBeenCalled();
  });

  it('refuses a file with no values', async () => {
    ocr.processBodyComposition.mockResolvedValue(run({ weight: null }));
    await expect(
      service.createFromOcrUpload('u1', Buffer.from('x'), 'image/png'),
    ).rejects.toMatchObject({ status: 422 });
  });
});

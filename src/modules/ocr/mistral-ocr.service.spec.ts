import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

const ocrProcess = jest.fn();
jest.mock('@mistralai/mistralai', () => ({
  Mistral: jest.fn().mockImplementation(() => ({ ocr: { process: ocrProcess } })),
}));

import { MistralOcrService, mergeTablesIntoMarkdown, pageText } from './mistral-ocr.service';

describe('MistralOcrService', () => {
  let storage: any;
  let env: Record<string, string | undefined>;
  let service: MistralOcrService;
  const pdf = Buffer.from('%PDF-1.7 lab report');

  beforeEach(() => {
    ocrProcess.mockReset();
    env = { MISTRAL_API_KEY: 'key' };
    storage = {
      putObject: jest.fn(async (key: string) => ({ key, url: `https://bucket/${key}` })),
      getPresignedUrl: jest.fn(
        async (key: string, ttl: number) => `https://signed/${key}?ttl=${ttl}`,
      ),
    };
    service = new MistralOcrService({ get: (k: string) => env[k] } as any, storage);
  });

  const file = (contentType = 'application/pdf') =>
    service.describeFile(pdf, contentType, 'lab-reports', 'user1');

  it('stores files under a content-addressed key per user', () => {
    const { fileKey, fileSha256 } = file();
    expect(fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fileKey).toMatch(new RegExp(`^lab-reports/user1/\\d{4}/\\d{2}/${fileSha256}\\.pdf$`));
    expect(() => service.describeFile(pdf, 'text/html', 'x', 'u')).toThrow(BadRequestException);
  });

  it('sends a PDF as document_url through a presigned URL, never the bytes', async () => {
    ocrProcess.mockResolvedValue({
      model: 'mistral-ocr-2512',
      pages: [{ index: 0, markdown: 'Hb 13' }],
      usageInfo: { pagesProcessed: 1 },
    });
    const f = file();
    await service.processLabReport(pdf, 'application/pdf', f);
    expect(storage.putObject).toHaveBeenCalledWith(f.fileKey, pdf, 'application/pdf');
    const request = ocrProcess.mock.calls[0][0];
    expect(request.document).toEqual({
      type: 'document_url',
      documentUrl: `https://signed/${f.fileKey}?ttl=3600`,
    });
    expect(request).toMatchObject({
      model: 'mistral-ocr-latest',
      tableFormat: 'markdown',
      extractHeader: true,
      extractFooter: true,
    });
    expect(request.documentAnnotationFormat).toMatchObject({
      type: 'json_schema',
      jsonSchema: { name: 'lab_report_extraction', strict: false },
    });
    expect(request.documentAnnotationPrompt).toContain('lab test result');
    expect(JSON.stringify(request)).not.toContain(pdf.toString('base64'));
  });

  it('sends an image as image_url, and honours MISTRAL_OCR_MODEL', async () => {
    env.MISTRAL_OCR_MODEL = 'mistral-ocr-custom';
    ocrProcess.mockResolvedValue({ pages: [], usageInfo: { pagesProcessed: 1 } });
    const f = file('image/jpeg');
    await service.processBodyComposition(pdf, 'image/jpeg', f);
    const request = ocrProcess.mock.calls[0][0];
    expect(request.document).toEqual({
      type: 'image_url',
      imageUrl: `https://signed/${f.fileKey}?ttl=3600`,
    });
    expect(request.model).toBe('mistral-ocr-custom');
    expect(f.fileKey.endsWith('.jpg')).toBe(true);
  });

  it('parses the annotation, keeps headers/footers in the text and records usage and cost', async () => {
    ocrProcess.mockResolvedValue({
      model: 'mistral-ocr-2512',
      documentAnnotation: JSON.stringify({ labName: 'City Lab', results: [] }),
      pages: [
        {
          index: 0,
          header: 'City Lab · 20 Oct 2026',
          markdown: 'Results\n\n[tbl-0.md](tbl-0.md)',
          tables: [{ id: 'tbl-0.md', content: '| Hb | 13 |' }],
          footer: 'Page 1',
        },
        { index: 1, markdown: 'Notes' },
      ],
      usageInfo: { pagesProcessed: 2 },
    });
    const run = await service.processLabReport(pdf, 'application/pdf', file());
    expect(run.annotation).toEqual({ labName: 'City Lab', results: [] });
    expect(run.rawText).toBe(
      'City Lab · 20 Oct 2026\n\nResults\n\n| Hb | 13 |\n\nPage 1\n\n---\n\nNotes',
    );
    expect(run).toMatchObject({
      pageCount: 2,
      costUsd: 0.002,
      model: 'mistral-ocr-2512',
      schemaVersion: 1,
    });
    expect(run.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('accepts snake_case fields from the SDK', async () => {
    ocrProcess.mockResolvedValue({
      document_annotation: '{"weight": 80}',
      pages: [{ markdown: 'x' }],
      usage_info: { pages_processed: 3 },
    });
    const run = await service.processBodyComposition(pdf, 'application/pdf', file());
    expect(run.annotation).toEqual({ weight: 80 });
    expect(run.pageCount).toBe(3);
  });

  it('treats a malformed annotation as missing rather than failing', async () => {
    ocrProcess.mockResolvedValue({
      documentAnnotation: '{not json',
      pages: [],
      usageInfo: { pagesProcessed: 1 },
    });
    expect((await service.processLabReport(pdf, 'application/pdf', file())).annotation).toBeNull();
  });

  it('skips the annotation for text-only OCR', async () => {
    ocrProcess.mockResolvedValue({
      pages: [{ markdown: 'hello' }],
      usageInfo: { pagesProcessed: 1 },
    });
    const result = await service.processGeneric(pdf, 'application/pdf', 'user1');
    expect(ocrProcess.mock.calls[0][0].documentAnnotationFormat).toBeUndefined();
    expect(result).toMatchObject({ rawText: 'hello', pageCount: 1, costUsd: 0.001 });
    expect(result).not.toHaveProperty('fileKey');
  });

  it('reports Mistral failures as 502 "OCR service error"', async () => {
    ocrProcess.mockRejectedValue(new Error('Document could not be fetched'));
    const err = await service.processLabReport(pdf, 'application/pdf', file()).catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.getResponse()).toMatchObject({
      message: 'OCR service error',
      detail: 'Document could not be fetched',
    });
  });

  it('is unavailable without MISTRAL_API_KEY, before storing anything', async () => {
    env.MISTRAL_API_KEY = undefined;
    await expect(service.processLabReport(pdf, 'application/pdf', file())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('merges table placeholders defensively', () => {
    expect(
      mergeTablesIntoMarkdown({
        markdown: 'a [t1](t1) b',
        tables: [{ id: 't1', content: 'TABLE' }],
      }),
    ).toBe('a TABLE b');
    expect(pageText({ markdown: 'body', header: '  ', footer: null })).toBe('body');
  });
});

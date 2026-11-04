import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { STORAGE_SERVICE, StorageService } from '../../common/services';

export interface BodyCompExtraction {
  height: number | null;
  weight: number | null;
  bmi: number | null;
  bodyFat: number | null;
  visceralFat: number | null;
  subcutaneousFat: number | null;
  muscleMass: number | null;
  boneMass: number | null;
  bodyWater: number | null;
  bmr: number | null;
  metabolicAge: number | null;
  waist: number | null;
  hip: number | null;
  chest: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
}

export interface LabTestResultExtraction {
  testName: string;
  value: number;
  unit: string | null;
  referenceMin: number | null;
  referenceMax: number | null;
  category: string | null;
}

export interface LabReportExtraction {
  labName: string | null;
  reportDate: string | null;
  results: LabTestResultExtraction[];
}

/** Where the uploaded file lives and what it is — enough to find a re-upload of the same bytes. */
export interface StoredFile {
  fileKey: string;
  fileSha256: string;
}

/** One OCR call's outcome and bookkeeping, recorded on whatever the OCR produced. */
export interface OcrRun<T> extends StoredFile {
  annotation: T | null;
  rawText: string;
  pageCount: number;
  elapsedMs: number;
  costUsd: number;
  model: string;
  schemaVersion: number | null;
}

interface Annotation {
  name: string;
  schema: object;
  prompt: string;
  /** Bump when the schema or prompt changes meaning; stored with each result. */
  version: number;
}

// Bump a version when its schema or prompt changes meaning (stored as ocrSchemaVersion).
const BODY_COMP_ANNOTATION: Annotation = {
  name: 'body_composition_extraction',
  version: 1,
  schema: {
    type: 'object',
    properties: {
      height: { type: ['number', 'null'], description: 'Height in cm' },
      weight: { type: ['number', 'null'], description: 'Weight in kg' },
      bmi: { type: ['number', 'null'] },
      bodyFat: { type: ['number', 'null'], description: 'Body fat percentage' },
      visceralFat: { type: ['number', 'null'] },
      subcutaneousFat: { type: ['number', 'null'], description: 'Subcutaneous fat percentage' },
      muscleMass: { type: ['number', 'null'], description: 'Muscle mass in kg' },
      boneMass: { type: ['number', 'null'], description: 'Bone mass in kg' },
      bodyWater: { type: ['number', 'null'], description: 'Body water percentage' },
      bmr: { type: ['number', 'null'], description: 'Basal metabolic rate in kcal' },
      metabolicAge: { type: ['integer', 'null'] },
      waist: { type: ['number', 'null'], description: 'Waist circumference in cm' },
      hip: { type: ['number', 'null'], description: 'Hip circumference in cm' },
      chest: { type: ['number', 'null'], description: 'Chest circumference in cm' },
      bloodPressureSystolic: { type: ['integer', 'null'] },
      bloodPressureDiastolic: { type: ['integer', 'null'] },
      heartRate: { type: ['integer', 'null'], description: 'Heart rate in bpm' },
      spo2: { type: ['number', 'null'], description: 'Blood oxygen saturation percentage' },
    },
  },
  prompt:
    'Extract every body composition metric visible on this scale/body-analyzer printout or screenshot, exactly as printed. ' +
    'Use null for any field not present on the document — do not guess, estimate, or infer a value that is not directly shown.',
};

const LAB_REPORT_ANNOTATION: Annotation = {
  name: 'lab_report_extraction',
  version: 1,
  schema: {
    type: 'object',
    properties: {
      labName: { type: ['string', 'null'] },
      reportDate: { type: ['string', 'null'], description: 'Report date in ISO format YYYY-MM-DD' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            testName: { type: 'string' },
            value: { type: 'number' },
            unit: { type: ['string', 'null'] },
            referenceMin: { type: ['number', 'null'] },
            referenceMax: { type: ['number', 'null'] },
            category: {
              type: ['string', 'null'],
              description: "e.g. 'Hematology', 'Lipid Profile', 'Thyroid'",
            },
          },
          required: ['testName', 'value'],
        },
      },
    },
    required: ['results'],
  },
  prompt:
    'Extract every lab test result from this report: test name, measured value, unit, and the reference range ' +
    '(min/max) if printed. Extract the lab name and report date if visible, converting the date to ISO 8601 ' +
    '(YYYY-MM-DD). Do not include section headers, comments, or footer text as test results.',
};

/** Mistral OCR's list price; override with MISTRAL_OCR_USD_PER_PAGE (e.g. for annotation pricing). */
const DEFAULT_USD_PER_PAGE = 0.001;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

// The SDK is ESM-only and this backend is CommonJS, so it's loaded once with a dynamic import.
let mistralCtorPromise: Promise<any> | null = null;
async function loadMistralCtor() {
  if (!mistralCtorPromise) {
    mistralCtorPromise = import('@mistralai/mistralai').then((m) => m.Mistral);
  }
  return mistralCtorPromise;
}

/**
 * With `tableFormat: "markdown"` tables are already inline; this swaps any leftover
 * `[tbl-0.md](tbl-0.md)` placeholder for the table's content, just in case.
 */
export function mergeTablesIntoMarkdown(page: {
  markdown?: string;
  tables?: { id: string; content: string }[];
}) {
  let markdown = page.markdown || '';
  for (const table of page.tables ?? []) {
    markdown = markdown.split(`[${table.id}](${table.id})`).join(table.content);
  }
  return markdown;
}

/** The page text with its extracted header and footer put back around it. */
export function pageText(page: {
  markdown?: string;
  tables?: { id: string; content: string }[];
  header?: string | null;
  footer?: string | null;
}) {
  return [page.header, mergeTablesIntoMarkdown(page), page.footer]
    .filter((part) => part && part.trim())
    .join('\n\n');
}

export function sha256Hex(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Mistral OCR (`POST /v1/ocr` via `client.ocr.process`). Files are stored in S3 under a
 * content-addressed key and Mistral reads them through a short-lived presigned URL — the bytes
 * are never sent to Mistral directly. PDFs go as `document_url`, images as `image_url`.
 * Configured by MISTRAL_API_KEY (and optionally MISTRAL_OCR_MODEL).
 */
@Injectable()
export class MistralOcrService {
  private readonly logger = new Logger(MistralOcrService.name);
  private client: any = null;

  constructor(
    private configService: ConfigService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  get isConfigured() {
    return !!this.configService.get<string>('MISTRAL_API_KEY');
  }

  private async getClient() {
    if (!this.isConfigured)
      throw new ServiceUnavailableException('OCR is not set up on this server');
    if (!this.client) {
      const Mistral = await loadMistralCtor();
      const serverURL = this.configService.get<string>('MISTRAL_SERVER_URL') || undefined;
      this.client = new Mistral({
        apiKey: this.configService.get<string>('MISTRAL_API_KEY'),
        serverURL,
      });
    }
    return this.client;
  }

  /** The content-addressed key and hash for an upload, without storing anything yet. */
  describeFile(buffer: Buffer, contentType: string, folder: string, ownerId: string): StoredFile {
    const ext = EXTENSIONS[contentType];
    if (!ext) throw new BadRequestException(`Unsupported file type: ${contentType}`);
    const fileSha256 = sha256Hex(buffer);
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return {
      fileSha256,
      fileKey: `${folder}/${ownerId}/${now.getUTCFullYear()}/${month}/${fileSha256}.${ext}`,
    };
  }

  /** A short-lived link to a stored file, for its owner to view the original. */
  presignedUrl(fileKey: string, expiresInSeconds = 15 * 60) {
    return this.storage.getPresignedUrl(fileKey, expiresInSeconds);
  }

  async runMistralOcr<T>(
    buffer: Buffer,
    contentType: string,
    file: StoredFile,
    annotation: Annotation | null,
  ): Promise<OcrRun<T>> {
    const client = await this.getClient();
    try {
      await this.storage.putObject(file.fileKey, buffer, contentType);
    } catch (err) {
      this.logger.error(`Storing ${file.fileKey} failed: ${(err as Error).message}`);
      throw new BadGatewayException({
        message: 'File storage error',
        detail: (err as Error).message,
      });
    }

    const url = await this.storage.getPresignedUrl(file.fileKey, 60 * 60);
    const requestedModel =
      this.configService.get<string>('MISTRAL_OCR_MODEL') || 'mistral-ocr-latest';
    const document =
      contentType === 'application/pdf'
        ? { type: 'document_url', documentUrl: url }
        : { type: 'image_url', imageUrl: url };

    const started = Date.now();
    let result: any;
    try {
      result = await client.ocr.process({
        model: requestedModel,
        document,
        tableFormat: 'markdown',
        extractHeader: true,
        extractFooter: true,
        ...(annotation && {
          documentAnnotationFormat: {
            type: 'json_schema',
            jsonSchema: {
              name: annotation.name,
              schemaDefinition: annotation.schema,
              strict: false,
            },
          },
          documentAnnotationPrompt: annotation.prompt,
        }),
      });
    } catch (err) {
      this.logger.error(`Mistral OCR failed for ${file.fileKey}: ${(err as Error).message}`);
      throw new BadGatewayException({
        message: 'OCR service error',
        detail: (err as Error).message,
      });
    }
    const elapsedMs = Date.now() - started;

    // The annotation is a JSON string; the SDK may surface camelCase or snake_case fields.
    const annotationText = result?.documentAnnotation ?? result?.document_annotation ?? null;
    let parsed: T | null = null;
    if (annotationText) {
      try {
        parsed = JSON.parse(annotationText);
      } catch (err) {
        this.logger.warn(`Mistral returned a non-JSON annotation: ${(err as Error).message}`);
      }
    }

    const pages: any[] = result?.pages ?? [];
    const pageCount =
      result?.usageInfo?.pagesProcessed ?? result?.usage_info?.pages_processed ?? pages.length;
    const usdPerPage =
      Number(this.configService.get<string>('MISTRAL_OCR_USD_PER_PAGE')) || DEFAULT_USD_PER_PAGE;
    const costUsd = Math.round(pageCount * usdPerPage * 1e6) / 1e6;
    const model = result?.model ?? requestedModel;
    this.logger.log(
      `Mistral OCR ${file.fileKey}: ${pageCount} page(s), ${elapsedMs} ms, $${costUsd} (${model})`,
    );

    return {
      ...file,
      annotation: parsed,
      rawText: pages.map(pageText).join('\n\n---\n\n'),
      pageCount,
      elapsedMs,
      costUsd,
      model,
      schemaVersion: annotation?.version ?? null,
    };
  }

  processBodyComposition(buffer: Buffer, contentType: string, file: StoredFile) {
    return this.runMistralOcr<BodyCompExtraction>(buffer, contentType, file, BODY_COMP_ANNOTATION);
  }

  processLabReport(buffer: Buffer, contentType: string, file: StoredFile) {
    return this.runMistralOcr<LabReportExtraction>(
      buffer,
      contentType,
      file,
      LAB_REPORT_ANNOTATION,
    );
  }

  /** OCR text only — no annotation, so cheaper and faster. */
  async processGeneric(buffer: Buffer, contentType: string, ownerId: string) {
    const file = this.describeFile(buffer, contentType, 'ocr-generic', ownerId);
    const {
      annotation: _none,
      fileKey: _key,
      ...run
    } = await this.runMistralOcr(buffer, contentType, file, null);
    return run;
  }
}

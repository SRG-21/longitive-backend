import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

export interface OcrExtraction<T> {
  data: T | null;
  rawText: string;
  pageCount: number;
  sourceUrl: string;
}

const BODY_COMP_SCHEMA = {
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
};

const BODY_COMP_PROMPT =
  'Extract every body composition metric visible on this scale/body-analyzer printout or screenshot, exactly as printed. ' +
  'Use null for any field not present on the document — do not guess, estimate, or infer a value that is not directly shown.';

const LAB_REPORT_SCHEMA = {
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
          category: { type: ['string', 'null'], description: "e.g. 'Hematology', 'Lipid Profile', 'Thyroid'" },
        },
        required: ['testName', 'value'],
      },
    },
  },
  required: ['results'],
};

const LAB_REPORT_PROMPT =
  'Extract every lab test result from this report: test name, measured value, unit, and the reference range ' +
  '(min/max) if printed. Extract the lab name and report date if visible, converting the date to ISO 8601 ' +
  '(YYYY-MM-DD). Do not include section headers, comments, or footer text as test results.';

let mistralCtorPromise: Promise<any> | null = null;
async function loadMistralCtor() {
  if (!mistralCtorPromise) {
    mistralCtorPromise = import('@mistralai/mistralai').then((m) => m.Mistral);
  }
  return mistralCtorPromise;
}

@Injectable()
export class MistralOcrService {
  private readonly logger = new Logger(MistralOcrService.name);
  private client: any = null;

  constructor(
    private configService: ConfigService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  private async getClient() {
    if (!this.client) {
      const Mistral = await loadMistralCtor();
      this.client = new Mistral({ apiKey: this.configService.get<string>('MISTRAL_API_KEY') });
    }
    return this.client;
  }

  private async runOcr<T>(
    buffer: Buffer,
    filename: string,
    folder: string,
    contentType: string,
    jsonSchema: object,
    schemaName: string,
    prompt: string,
  ): Promise<OcrExtraction<T>> {
    const { key } = await this.storage.upload(buffer, filename, folder, contentType);
    const documentUrl = await this.storage.getPresignedUrl(key);
    const client = await this.getClient();
    const model = this.configService.get<string>('MISTRAL_OCR_MODEL') || 'mistral-ocr-latest';

    const result = await client.ocr.process({
      model,
      document: { type: 'document_url', documentUrl },
      tableFormat: 'markdown',
      documentAnnotationFormat: {
        type: 'json_schema',
        jsonSchema: { name: schemaName, schemaDefinition: jsonSchema, strict: false },
      },
      documentAnnotationPrompt: prompt,
    });

    const annotationStr = result.documentAnnotation ?? result.document_annotation ?? null;
    let data: T | null = null;
    if (annotationStr) {
      try {
        data = JSON.parse(annotationStr);
      } catch (err) {
        this.logger.warn(`Mistral returned non-JSON annotation: ${(err as Error).message}`);
      }
    }

    const pages = result.pages || [];
    const rawText = pages.map((p: any) => p.markdown || '').join('\n\n---\n\n');

    return { data, rawText, pageCount: pages.length, sourceUrl: this.storage.getPublicUrl(key) };
  }

  processBodyComposition(buffer: Buffer, filename: string, contentType: string) {
    return this.runOcr<BodyCompExtraction>(
      buffer,
      filename,
      'body-composition',
      contentType,
      BODY_COMP_SCHEMA,
      'body_composition_extraction',
      BODY_COMP_PROMPT,
    );
  }

  processLabReport(buffer: Buffer, filename: string, contentType: string) {
    return this.runOcr<LabReportExtraction>(
      buffer,
      filename,
      'lab-reports',
      contentType,
      LAB_REPORT_SCHEMA,
      'lab_report_extraction',
      LAB_REPORT_PROMPT,
    );
  }

  /** Ad-hoc OCR with no structured schema — just the extracted markdown text. */
  async processGeneric(buffer: Buffer, filename: string, contentType: string) {
    const { key } = await this.storage.upload(buffer, filename, 'ocr-generic', contentType);
    const documentUrl = await this.storage.getPresignedUrl(key);
    const client = await this.getClient();
    const model = this.configService.get<string>('MISTRAL_OCR_MODEL') || 'mistral-ocr-latest';

    const result = await client.ocr.process({
      model,
      document: { type: 'document_url', documentUrl },
      tableFormat: 'markdown',
    });

    const pages = result.pages || [];
    const rawText = pages.map((p: any) => p.markdown || '').join('\n\n---\n\n');
    return { rawText, pageCount: pages.length, sourceUrl: this.storage.getPublicUrl(key) };
  }
}

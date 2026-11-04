import { toDay, toInt, toNumber, toText } from '../ocr/ocr-values';

// Int columns in the schema; OCR may read them as decimals ("72.0"), so they're rounded.
export const INT_FIELDS = [
  'age',
  'bodyScore',
  'metabolicAge',
  'bloodPressureSystolic',
  'bloodPressureDiastolic',
  'heartRate',
] as const;

export const FLOAT_FIELDS = [
  'height',
  'weight',
  'bmi',
  'bodyFat',
  'fatMass',
  'visceralFat',
  'subcutaneousFat',
  'subcutaneousFatMass',
  'muscleMass',
  'skeletalMuscleMass',
  'boneMass',
  'bodyWater',
  'bodyWaterMass',
  'proteinMass',
  'mineralMass',
  'bmr',
  'standardWeight',
  'weightControl',
  'fatControl',
  'muscleControl',
  'waist',
  'hip',
  'chest',
  'spo2',
] as const;

export const TEXT_FIELDS = ['bodyType', 'deviceName', 'deviceId', 'reportName'] as const;

export const SEGMENT_KEYS = ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'] as const;

// Percentages the report may print only as a mass in kg; we work them out from the total weight.
const PERCENT_FROM_MASS = [
  ['bodyFat', 'fatMass'],
  ['bodyWater', 'bodyWaterMass'],
  ['subcutaneousFat', 'subcutaneousFatMass'],
] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

function segments(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const out: Record<string, { mass: number | null; percent: number | null }> = {};
  for (const key of SEGMENT_KEYS) {
    const seg = (value as Record<string, unknown>)[key];
    if (!seg || typeof seg !== 'object') continue;
    const mass = toNumber((seg as Record<string, unknown>).mass);
    const percent = toNumber(
      String((seg as Record<string, unknown>).percent ?? '').replace('%', ''),
    );
    if (mass != null || percent != null) out[key] = { mass, percent };
  }
  return Object.keys(out).length ? out : null;
}

function time(value: unknown) {
  const t = toText(value);
  const m = t?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] ?? 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}

/**
 * Turns a raw (strict: false) OCR annotation into BodyComposition columns: numbers cleaned,
 * ints rounded, segment tables kept, and fat / water / subcutaneous % derived from kg when
 * the report prints only the mass. `values` excludes the date and is empty when nothing was read.
 */
export function normalizeBodyCompAnnotation(raw: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  for (const k of FLOAT_FIELDS) {
    const v = toNumber(raw[k]);
    if (v != null) values[k] = v;
  }
  for (const k of INT_FIELDS) {
    const v = toInt(raw[k]);
    if (v != null) values[k] = v;
  }
  for (const k of TEXT_FIELDS) {
    const v = toText(raw[k]);
    if (v != null) values[k] = v.slice(0, 120);
  }
  const fat = segments(raw.segmentalFat);
  const muscle = segments(raw.segmentalMuscle);
  if (fat) values.segmentalFat = fat;
  if (muscle) values.segmentalMuscle = muscle;

  const weight = values.weight as number | undefined;
  if (weight && weight > 0) {
    for (const [pct, mass] of PERCENT_FROM_MASS) {
      if (values[pct] == null && values[mass] != null) {
        values[pct] = round1(((values[mass] as number) / weight) * 100);
      }
    }
  }

  const day = toDay(raw.reportDate);
  const measuredTime = day ? time(raw.reportTime) : null;
  return { values, day, measuredTime };
}

// OCR annotations use strict: false, so a field may come back as a string ("5.2", "1,250"),
// an empty string or junk. These helpers keep only values that are really there.

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInt(value: unknown): number | null {
  const n = toNumber(value);
  return n == null ? null : Math.round(n);
}

export function toText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** LOW / HIGH from the printed reference range; NORMAL when inside it or when there is none. */
export function statusFromRange(value: number, min: number | null, max: number | null) {
  if (min != null && value < min) return 'LOW' as const;
  if (max != null && value > max) return 'HIGH' as const;
  return 'NORMAL' as const;
}

/** A real YYYY-MM-DD day (not 2026-02-31), or null. */
export function toDay(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

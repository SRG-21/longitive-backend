// Tracker dates are calendar days. They are stored as UTC midnight and exchanged as
// "YYYY-MM-DD" strings, so all day arithmetic here is done on those strings in UTC —
// never on local-time Dates — to keep a day from shifting with the server's timezone.

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day in YYYY-MM-DD form (rejects 2026-02-31). */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** The calendar day (UTC) of a stored date or ISO string. */
export function dayOf(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return dayOf(new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
      DAY_MS,
  );
}

/** Every day from `from` to `to`, inclusive; empty when `to` is before `from`. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The calendar day (YYYY-MM-DD) that `date` falls on in `timeZone`. */
export function dayInZone(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

import { dayInZone } from '../journey-tracker/tracker-dates';

// When the logging alerts go out, in the reminder timezone (REMINDER_TIMEZONE, default IST).
// Vercel Cron schedules are UTC: these are 09:30 and 18:00 UTC — keep vercel.json in step.
export const DAILY_REMINDER_TIME = '15:00';
export const MISSED_DAY_ALERT_TIME = '23:30';
export const DEFAULT_REMINDER_TIMEZONE = 'Asia/Kolkata';

export type AlertKind = 'daily' | 'missed';

export { dayInZone };

// Vercel Hobby crons may fire anywhere within their scheduled hour, so the 23:30 run can land
// after midnight. Looking back a few hours keeps it about the day that is ending.
const MISSED_DAY_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/** The day an alert run is about: today for the afternoon reminder, the closing day for the late one. */
export function alertDay(kind: AlertKind, now: Date, timeZone: string): string {
  return dayInZone(
    kind === 'missed' ? new Date(now.getTime() - MISSED_DAY_LOOKBACK_MS) : now,
    timeZone,
  );
}

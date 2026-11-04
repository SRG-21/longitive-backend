import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';

/** What Claude returns for a review, enforced with structured outputs. */
export const JourneyReviewOutput = z.object({
  headline: z.string().describe('One short sentence that sums up the period, in plain language.'),
  summary: z
    .string()
    .describe('Two to four sentences on how the period went, citing the actual numbers and dates.'),
  wins: z.array(z.string()).describe('Specific things that went well, each grounded in the data.'),
  concerns: z
    .array(z.string())
    .describe('Patterns worth attention, stated neutrally. Empty if there are none.'),
  suggestions: z
    .array(
      z.object({
        title: z.string().describe('A short, actionable suggestion.'),
        detail: z.string().describe('What to do this coming week, concretely.'),
        why: z.string().describe('Why it should help, tied to this person’s data.'),
      }),
    )
    .describe('Two to four small, doable suggestions for the coming week.'),
});

export type JourneyReviewContent = z.infer<typeof JourneyReviewOutput>;

/**
 * The structured-output format for the review. Built once, from a schema typed by its result
 * rather than inferred: inferring this nested zod type inside the SDK helper's generics
 * exceeds TypeScript's instantiation depth in some compilers (ts-jest).
 */
export const JOURNEY_REVIEW_FORMAT = betaZodOutputFormat(
  JourneyReviewOutput as unknown as z.ZodType<JourneyReviewContent>,
);

export const REVIEW_SYSTEM_PROMPT = `You are a supportive health and lifestyle coach inside a longevity app. You review one person's journey tracker — a time-boxed plan such as a 90-day weight-loss journey — and write the review directly to them ("you").

The tracker's data arrives as JSON: the schedule (start date, proposed end date, today), each field with its cadence (daily habits vs. weekly body measurements), starting values and targets (only body measurements have targets), the latest values, logging status, recent entries and number trends.

How to write the review:
- Ground every statement in the data and cite real numbers and dates. If there is little data, say so plainly and keep suggestions general rather than inventing trends.
- Measure progress against the starting values and targets. Point out how daily habits line up with changes in measurements, without claiming one caused the other.
- Missed days are normal. Mention gaps neutrally; if logging is patchy, offer one practical way to make it easier. Never shame.
- Give two to four suggestions for the coming week: small, specific and achievable, each tied to something in their data.
- You are not their doctor. Don't diagnose or suggest medication changes. If something looks worrying — for example sustained weight loss faster than about 1 kg a week, or extreme values — recommend checking in with a healthcare professional.
- Be warm and concise, use plain language and the units given, and don't repeat the raw data back.`;

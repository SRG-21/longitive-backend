import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { PrismaService } from '../../prisma/prisma.service';
import { JourneySummaryService } from '../journey-tracker/journey-summary.service';
import { addDays, dayInZone, daysBetween, dayOf, isDay } from '../journey-tracker/tracker-dates';
import { DEFAULT_REMINDER_TIMEZONE } from '../telegram/telegram-schedule';

const MAX_ENTRY_RANGE_DAYS = 180;
const DEFAULT_ENTRY_RANGE_DAYS = 30;

const INSTRUCTIONS = `Read-only access to one person's data in the Longevity app: their journey trackers (time-boxed plans such as a 90-day weight-loss journey, with daily habit fields and weekly body measurements, starting values and targets), the entries they have logged, their body composition measurements, and reviews Claude has already written for them.

Start with list_trackers, then get_journey_summary for the tracker the person cares about; use get_tracker_entries when you need day-by-day detail. Dates are calendar days (YYYY-MM-DD) in the person's local time. Missed days are normal — discuss them without judgement. This is wellness data, not a medical record: don't diagnose, and suggest a healthcare professional for anything that looks worrying.`;

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});
const failure = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/** Builds an MCP server whose tools can only see one user's data. */
@Injectable()
export class JourneyMcpServerFactory {
  constructor(
    private prisma: PrismaService,
    private summaries: JourneySummaryService,
    private config: ConfigService,
  ) {}

  private today() {
    return dayInZone(
      new Date(),
      this.config.get<string>('REMINDER_TIMEZONE') || DEFAULT_REMINDER_TIMEZONE,
    );
  }

  create(userId: string) {
    const server = new McpServer(
      { name: 'longevity-journeys', version: '1.0.0' },
      { instructions: INSTRUCTIONS },
    );
    const readOnly = { readOnlyHint: true, openWorldHint: false };
    const guard = async (run: () => Promise<unknown>) => {
      try {
        return json(await run());
      } catch (err) {
        return failure((err as Error).message || 'Something went wrong');
      }
    };

    server.registerTool(
      'list_trackers',
      {
        title: 'List journey trackers',
        description:
          "The person's journey trackers with status, start and proposed end date, and how far in they are.",
        annotations: readOnly,
      },
      async () => guard(() => this.summaries.listTrackers(userId, this.today())),
    );

    server.registerTool(
      'get_journey_summary',
      {
        title: 'Journey summary',
        description:
          'Everything needed to review one tracker: schedule and progress, each field (daily or weekly) with its starting value, target and latest value, logging and missed days, weekly check-ins, the last 14 entries and number trends.',
        inputSchema: { tracker_id: z.string().describe('From list_trackers') },
        annotations: readOnly,
      },
      async ({ tracker_id }) =>
        guard(() => this.summaries.getSummary(userId, tracker_id, this.today())),
    );

    server.registerTool(
      'get_tracker_entries',
      {
        title: 'Tracker entries',
        description: `Day-by-day logged values for one tracker, labelled by field. Defaults to the last ${DEFAULT_ENTRY_RANGE_DAYS} days; at most ${MAX_ENTRY_RANGE_DAYS} days per call.`,
        inputSchema: {
          tracker_id: z.string().describe('From list_trackers'),
          from: z.string().optional().describe('First day, YYYY-MM-DD'),
          to: z.string().optional().describe('Last day, YYYY-MM-DD (default today)'),
        },
        annotations: readOnly,
      },
      async ({ tracker_id, from, to }) =>
        guard(async () => {
          const last = to ?? this.today();
          const first = from ?? addDays(last, -(DEFAULT_ENTRY_RANGE_DAYS - 1));
          if (!isDay(first) || !isDay(last)) throw new Error('from and to must be YYYY-MM-DD days');
          if (first > last) throw new Error('from must be on or before to');
          if (daysBetween(first, last) >= MAX_ENTRY_RANGE_DAYS) {
            throw new Error(`Ask for at most ${MAX_ENTRY_RANGE_DAYS} days at a time`);
          }
          return {
            from: first,
            to: last,
            entries: await this.summaries.getEntries(userId, tracker_id, first, last),
          };
        }),
    );

    server.registerTool(
      'get_body_composition',
      {
        title: 'Body composition',
        description:
          'Recent body composition measurements (weight, BMI, body fat, muscle mass, waist, blood pressure…), newest first.',
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe('How many measurements (default 20)'),
        },
        annotations: readOnly,
      },
      async ({ limit }) =>
        guard(async () => {
          const rows = await this.prisma.bodyComposition.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: limit ?? 20,
          });
          return rows.map(
            ({
              id: _id,
              userId: _u,
              tenantId: _t,
              rawOcrText: _r,
              sourceImageUrl: _s,
              createdAt: _c,
              ...m
            }) => ({
              ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null)),
              date: dayOf(m.date),
            }),
          );
        }),
    );

    server.registerTool(
      'get_latest_reviews',
      {
        title: 'Claude reviews',
        description:
          'Reviews Claude has already written for a tracker (weekly or on request), newest first.',
        inputSchema: {
          tracker_id: z.string().describe('From list_trackers'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe('How many reviews (default 3)'),
        },
        annotations: readOnly,
      },
      async ({ tracker_id, limit }) =>
        guard(async () => {
          const reviews = await this.prisma.journeyReview.findMany({
            where: { trackerId: tracker_id, userId },
            orderBy: { createdAt: 'desc' },
            take: limit ?? 3,
          });
          return reviews.map((r) => ({
            kind: r.kind,
            period: { from: r.periodStart, to: r.periodEnd },
            headline: r.headline,
            summary: r.summary,
            wins: r.wins,
            concerns: r.concerns,
            suggestions: r.suggestions,
            writtenAt: r.createdAt,
          }));
        }),
    );

    server.registerPrompt(
      'review_my_journey',
      {
        title: 'Review my journey',
        description: 'Analyse a journey tracker and suggest what to do next.',
        argsSchema: { tracker_id: z.string().describe('From list_trackers') },
      },
      ({ tracker_id }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review my journey tracker ${tracker_id}. Use get_journey_summary first, and get_tracker_entries if you need more detail. Tell me how I'm doing against my starting point and targets, which habits seem to line up with my progress, and give me 2–4 specific, doable suggestions for the coming week. Be honest but kind about missed days.`,
            },
          },
        ],
      }),
    );

    return server;
  }
}

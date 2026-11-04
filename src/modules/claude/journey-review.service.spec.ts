import { HttpException } from '@nestjs/common';
import { currentWeek, finishedWeek, JourneyReviewService } from './journey-review.service';

describe('review periods', () => {
  it('finds the last full 7-day block from the start date', () => {
    expect(finishedWeek('2026-11-01', null, '2026-11-06')).toBeNull(); // week 1 still running
    expect(finishedWeek('2026-11-01', null, '2026-11-07')).toEqual({
      week: 1,
      from: '2026-11-01',
      to: '2026-11-07',
    });
    expect(finishedWeek('2026-11-01', null, '2026-11-10')).toEqual({
      week: 1,
      from: '2026-11-01',
      to: '2026-11-07',
    });
    expect(finishedWeek('2026-11-01', null, '2026-11-14')).toEqual({
      week: 2,
      from: '2026-11-08',
      to: '2026-11-14',
    });
  });

  it('treats a journey that ends mid-week as a final, shorter block', () => {
    expect(finishedWeek('2026-11-01', '2026-11-10', '2026-11-10')).toEqual({
      week: 2,
      from: '2026-11-08',
      to: '2026-11-10',
    });
    expect(finishedWeek('2026-11-01', '2026-11-10', '2026-12-01')).toEqual({
      week: 2,
      from: '2026-11-08',
      to: '2026-11-10',
    });
  });

  it('has nothing before the journey starts', () => {
    expect(finishedWeek('2026-11-10', null, '2026-11-01')).toBeNull();
  });

  it('describes the week in progress for on-demand reviews', () => {
    expect(currentWeek('2026-11-01', '2026-11-09')).toEqual({
      week: 2,
      from: '2026-11-08',
      to: '2026-11-09',
    });
  });
});

describe('JourneyReviewService', () => {
  const review = {
    headline: 'Solid week',
    summary: 'Down 0.6 kg.',
    wins: ['Logged 6 of 7 days'],
    concerns: [],
    suggestions: [{ title: 'Walk after dinner', detail: '15 min', why: 'Steps dip at night' }],
  };
  let prisma: any;
  let claude: any;
  let telegram: any;
  let service: JourneyReviewService;
  let reviews: any[];
  let parse: jest.Mock;

  const tracker = (overrides: Record<string, unknown> = {}) => ({
    id: 't1',
    userId: 'u1',
    tenantId: 'ten',
    name: 'Journey',
    status: 'ACTIVE',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: null,
    ...overrides,
  });

  beforeEach(() => {
    reviews = [];
    parse = jest.fn(async () => ({
      stop_reason: 'end_turn',
      parsed_output: review,
      model: 'claude-opus-5-5',
    }));
    claude = {
      isConfigured: true,
      model: 'claude-opus-5-5',
      anthropic: { beta: { messages: { parse } } },
    };
    prisma = {
      journeyTracker: {
        findFirst: jest.fn(async ({ where }) =>
          where.id === 't1' && where.userId === 'u1' ? tracker() : null,
        ),
        findMany: jest.fn(async () => [tracker()]),
      },
      journeyReview: {
        findFirst: jest.fn(
          async ({ where }) =>
            [...reviews]
              .reverse()
              .find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
        ),
        findMany: jest.fn(async () => reviews),
        create: jest.fn(async ({ data }) => {
          const row = { id: `r${reviews.length + 1}`, createdAt: new Date(), ...data };
          reviews.push(row);
          return row;
        }),
      },
      telegramLink: { findUnique: jest.fn(async () => ({ chatId: '777', weeklyReview: null })) },
    };
    telegram = { isConfigured: true, sendMessage: jest.fn(async () => ({})) };
    const summaries: any = { getSummary: jest.fn(async () => ({ tracker: { name: 'Journey' } })) };
    const config: any = { get: (k: string) => ({ FRONTEND_URL: 'https://app.example.com' })[k] };
    service = new JourneyReviewService(prisma, claude, summaries, telegram, config);
  });

  it('asks Claude with structured output and a refusal fallback, then saves the review', async () => {
    const saved = await service.requestReview('u1', 't1', '2026-11-09');
    const request = parse.mock.calls[0][0];
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
    });
    expect(request.output_config.format).toBeTruthy();
    expect(request.messages[0].content).toContain('week 2 so far, 2026-11-08 to 2026-11-09');
    expect(saved).toMatchObject({
      kind: 'manual',
      periodStart: '2026-11-08',
      periodEnd: '2026-11-09',
      headline: 'Solid week',
    });
  });

  it('records the model that actually answered (it may be a fallback)', async () => {
    parse.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      parsed_output: review,
      model: 'claude-opus-5',
    });
    expect((await service.requestReview('u1', 't1', '2026-11-09')).model).toBe('claude-opus-5');
  });

  it('refuses a second on-demand review within the cooldown', async () => {
    await service.requestReview('u1', 't1', '2026-11-09');
    await expect(service.requestReview('u1', 't1', '2026-11-09')).rejects.toMatchObject({
      status: 429,
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("won't review someone else's tracker", async () => {
    await expect(service.requestReview('u2', 't1')).rejects.toMatchObject({ status: 404 });
  });

  it('turns a refusal or incomplete output into an error, saving nothing', async () => {
    parse.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null, model: 'x' });
    await expect(service.requestReview('u1', 't1', '2026-11-09')).rejects.toBeInstanceOf(
      HttpException,
    );
    parse.mockResolvedValueOnce({ stop_reason: 'max_tokens', parsed_output: null, model: 'x' });
    await expect(service.requestReview('u1', 't1', '2026-11-09')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(reviews).toHaveLength(0);
  });

  it('is unavailable without an API key', async () => {
    claude.isConfigured = false;
    await expect(service.requestReview('u1', 't1')).rejects.toMatchObject({ status: 503 });
    expect((await service.runScheduled({ day: '2026-11-07' })).reviewed).toBe(0);
  });

  describe('scheduled run', () => {
    it('reviews a week that just finished, once, and sends it to Telegram', async () => {
      const first = await service.runScheduled({ day: '2026-11-07' });
      expect(first).toMatchObject({ considered: 1, reviewed: 1 });
      expect(reviews[0]).toMatchObject({
        kind: 'weekly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-07',
      });
      const [chatId, html, buttons] = telegram.sendMessage.mock.calls[0];
      expect(chatId).toBe('777');
      expect(html).toContain('Week 1 review');
      expect(html).toContain('Walk after dinner');
      expect(buttons[0].url).toBe('https://app.example.com/journey-trackers/t1/weekly-review');

      const second = await service.runScheduled({ day: '2026-11-08' });
      expect(second).toMatchObject({ reviewed: 0, alreadyDone: 1 });
      expect(parse).toHaveBeenCalledTimes(1);
    });

    it('skips trackers mid-week and does not chase weeks long past', async () => {
      expect((await service.runScheduled({ day: '2026-11-05' })).considered).toBe(0); // week 1 still running
      prisma.journeyTracker.findMany.mockResolvedValue([
        tracker({ endDate: new Date('2026-11-10T00:00:00Z') }),
      ]);
      expect((await service.runScheduled({ day: '2026-12-01' })).considered).toBe(0); // journey ended 3 weeks ago
    });

    it('catches up a week missed by an earlier run within six days', async () => {
      expect((await service.runScheduled({ day: '2026-11-13' })).reviewed).toBe(1); // week 1 (ended 11-07)
    });

    it("respects the user's Telegram opt-out", async () => {
      prisma.telegramLink.findUnique.mockResolvedValue({ chatId: '777', weeklyReview: false });
      await service.runScheduled({ day: '2026-11-07' });
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('keeps going when one tracker fails', async () => {
      prisma.journeyTracker.findMany.mockResolvedValue([tracker(), tracker({ id: 't2' })]);
      parse.mockRejectedValueOnce(new Error('boom'));
      expect(await service.runScheduled({ day: '2026-11-07' })).toMatchObject({
        reviewed: 1,
        failed: 1,
      });
    });
  });
});

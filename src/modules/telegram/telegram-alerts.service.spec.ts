import { Prisma } from '@prisma/client';
import { TelegramAlertsService, buildAlertMessage } from './telegram-alerts.service';
import { TelegramApiError } from './telegram.service';
import { alertDay } from './telegram-schedule';

const status = (overrides: Record<string, unknown> = {}) => ({
  started: true,
  endDate: null,
  hasDailyFields: true,
  loggedToday: false,
  dayNumber: 3,
  totalDays: 90,
  missedDays: [] as string[],
  ...overrides,
});

describe('alertDay', () => {
  it('uses the IST calendar day for the afternoon reminder', () => {
    // 09:30 UTC = 15:00 IST on the same day
    expect(alertDay('daily', new Date('2026-11-03T09:30:00Z'), 'Asia/Kolkata')).toBe('2026-11-03');
  });

  it('keeps the late alert about the closing day even if the cron fires after midnight IST', () => {
    expect(alertDay('missed', new Date('2026-11-03T18:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-03'); // 23:30 IST
    expect(alertDay('missed', new Date('2026-11-03T18:55:00Z'), 'Asia/Kolkata')).toBe('2026-11-03'); // 00:25 IST next day
  });
});

describe('buildAlertMessage', () => {
  const tracker = {
    id: 't1',
    name: 'Weight <Loss> & more',
    dayNumber: 3,
    totalDays: 90,
    earlierMissed: 2,
  };

  it('escapes tracker names and links straight to the day', () => {
    const { html, buttons } = buildAlertMessage(
      'daily',
      '2026-11-03',
      [tracker],
      'https://app.example.com',
    );
    expect(html).toContain('Weight &lt;Loss&gt; &amp; more');
    expect(html).toContain('Tue 3 Nov');
    expect(html).toContain('day 3 of 90');
    expect(buttons).toEqual([
      { text: 'Log today', url: 'https://app.example.com/journey-trackers/t1/daily/2026-11-03' },
    ]);
  });

  it('mentions earlier gaps only in the missed-day alert', () => {
    expect(buildAlertMessage('missed', '2026-11-03', [tracker], null).html).toContain(
      '2 earlier days to fill in too',
    );
    expect(buildAlertMessage('daily', '2026-11-03', [tracker], null).html).not.toContain('earlier');
  });

  it('has no buttons without an app URL', () => {
    expect(buildAlertMessage('daily', '2026-11-03', [tracker], null).buttons).toEqual([]);
  });
});

describe('TelegramAlertsService', () => {
  let links: any[];
  let trackersByUser: Record<string, any[]>;
  let statuses: Record<string, ReturnType<typeof status>>;
  let claimed: Set<string>;
  let prisma: any;
  let telegram: any;
  let service: TelegramAlertsService;

  beforeEach(() => {
    links = [
      {
        id: 'l1',
        userId: 'u1',
        tenantId: 'ten',
        chatId: '111',
        dailyReminder: null,
        missedDayAlert: null,
      },
    ];
    trackersByUser = { u1: [{ id: 't1', name: 'Journey' }] };
    statuses = { t1: status() };
    claimed = new Set();
    prisma = {
      telegramLink: { findMany: jest.fn(async () => links), update: jest.fn() },
      journeyTracker: {
        findMany: jest.fn(async ({ where }) => trackersByUser[where.userId] ?? []),
      },
      telegramAlertLog: {
        findFirst: jest.fn(async ({ where }) =>
          claimed.has(`${where.userId}|${where.kind}|${where.day}`) ? { id: 'existing' } : null,
        ),
        create: jest.fn(async ({ data }) => {
          const key = `${data.userId}|${data.kind}|${data.day}`;
          if (claimed.has(key)) {
            throw new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'x',
            });
          }
          claimed.add(key);
          return { id: key };
        }),
        delete: jest.fn(async ({ where }) => claimed.delete(where.id)),
      },
    };
    telegram = { isConfigured: true, sendMessage: jest.fn(async () => ({})) };
    const entries: any = {
      getLoggingStatus: jest.fn(async (_u: string, trackerId: string) => statuses[trackerId]),
    };
    const config: any = {
      get: (key: string) => ({ FRONTEND_URL: 'https://app.example.com/' })[key],
    };
    service = new TelegramAlertsService(prisma, telegram, entries, config);
  });

  it('reminds a user whose active tracker is not logged for the day', async () => {
    const result = await service.run('daily', { day: '2026-11-03' });
    expect(result).toMatchObject({ sent: 1, skipped: 0, linkedUsers: 1 });
    const [chatId, html, buttons] = telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('111');
    expect(html).toContain('Journey');
    expect(buttons[0].url).toBe('https://app.example.com/journey-trackers/t1/daily/2026-11-03');
  });

  it.each([
    ['already logged', { loggedToday: true }],
    ['not started yet', { started: false }],
    ['past its end date', { endDate: '2026-11-02' }],
    ['weekly fields only', { hasDailyFields: false }],
  ])('skips a tracker that is %s', async (_label, overrides) => {
    statuses.t1 = status(overrides);
    const result = await service.run('daily', { day: '2026-11-03' });
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('respects each alert toggle separately', async () => {
    links[0].dailyReminder = false;
    expect((await service.run('daily', { day: '2026-11-03' })).sent).toBe(0);
    expect((await service.run('missed', { day: '2026-11-03' })).sent).toBe(1);
  });

  it('sends one message per user per kind per day, however often it runs', async () => {
    await service.run('daily', { day: '2026-11-03' });
    const second = await service.run('daily', { day: '2026-11-03' });
    expect(second).toMatchObject({ sent: 0, duplicates: 1 });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    // a different kind (or day) is a different alert
    expect((await service.run('missed', { day: '2026-11-03' })).sent).toBe(1);
  });

  it('still skips a repeat when the unique index is missing (db push not run yet)', async () => {
    const rows: any[] = [];
    prisma.telegramAlertLog.create.mockImplementation(
      async ({ data }: any) => (rows.push(data), { id: String(rows.length) }),
    );
    prisma.telegramAlertLog.findFirst.mockImplementation(
      async ({ where }: any) =>
        rows.find(
          (r) => r.userId === where.userId && r.kind === where.kind && r.day === where.day,
        ) ?? null,
    );
    await service.run('daily', { day: '2026-11-03' });
    expect((await service.run('daily', { day: '2026-11-03' })).duplicates).toBe(1);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('treats a unique-index conflict from a concurrent run as a duplicate', async () => {
    prisma.telegramAlertLog.findFirst.mockResolvedValueOnce(null);
    claimed.add('u1|daily|2026-11-03'); // the other run claimed it between our lookup and insert
    prisma.telegramAlertLog.findFirst.mockResolvedValueOnce(null);
    const result = await service.run('daily', { day: '2026-11-03' });
    expect(result).toMatchObject({ sent: 0, duplicates: 1 });
  });

  it('lists every unlogged tracker in a single message', async () => {
    trackersByUser.u1.push({ id: 't2', name: 'Second' });
    statuses.t2 = status();
    await service.run('daily', { day: '2026-11-03' });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage.mock.calls[0][2]).toHaveLength(2);
  });

  it('releases the claim when sending fails, so a retry can deliver it', async () => {
    telegram.sendMessage.mockRejectedValueOnce(new TelegramApiError(500, 'oops'));
    expect((await service.run('daily', { day: '2026-11-03' })).failed).toBe(1);
    expect((await service.run('daily', { day: '2026-11-03' })).sent).toBe(1);
    expect(prisma.telegramLink.update).not.toHaveBeenCalled();
  });

  it('unlinks a chat that blocked the bot', async () => {
    telegram.sendMessage.mockRejectedValueOnce(
      new TelegramApiError(403, 'Forbidden: bot was blocked by the user'),
    );
    await service.run('daily', { day: '2026-11-03' });
    expect(prisma.telegramLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ chatId: null }),
      }),
    );
  });

  it('does nothing when no bot token is configured', async () => {
    telegram.isConfigured = false;
    expect((await service.run('daily', { day: '2026-11-03' })).linkedUsers).toBe(0);
    expect(prisma.telegramLink.findMany).not.toHaveBeenCalled();
  });
});

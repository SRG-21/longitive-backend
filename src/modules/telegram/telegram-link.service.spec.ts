import { TelegramLinkService } from './telegram-link.service';

describe('TelegramLinkService', () => {
  let link: any;
  let prisma: any;
  let telegram: any;
  let service: TelegramLinkService;

  const message = (text: string, chatType = 'private') => ({
    message: { text, chat: { id: 555, type: chatType }, from: { username: 'demo_user' } },
  });

  beforeEach(() => {
    link = {
      id: 'l1',
      userId: 'u1',
      chatId: null,
      linkToken: 'abc123',
      linkTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    prisma = {
      telegramLink: {
        findUnique: jest.fn(async () => link),
        findFirst: jest.fn(async ({ where }) => (where.linkToken === link.linkToken ? link : null)),
        findMany: jest.fn(async ({ where }) => (link.chatId === where.chatId ? [link] : [])),
        update: jest.fn(async ({ data }) => Object.assign(link, data)),
        upsert: jest.fn(async ({ update }) => Object.assign(link, update)),
      },
    };
    telegram = {
      isConfigured: true,
      botUsername: jest.fn(async () => 'LongevityBot'),
      sendMessage: jest.fn(),
    };
    const config: any = { get: () => undefined };
    service = new TelegramLinkService(prisma, telegram, config);
  });

  it('creates a one-time deep link for the bot', async () => {
    const { deepLink } = await service.createLink('u1');
    expect(deepLink).toMatch(/^https:\/\/t\.me\/LongevityBot\?start=[0-9a-f]{32}$/);
    expect(link.linkToken).toBe(deepLink.split('=')[1]);
  });

  it('links the chat when Start is pressed with a valid token, then forgets the token', async () => {
    await service.handleUpdate(message('/start abc123'));
    expect(link).toMatchObject({ chatId: '555', username: 'demo_user', linkToken: null });
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Connected');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('3:00 pm IST');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('11:30 pm IST');
  });

  it('refuses an expired token', async () => {
    link.linkTokenExpiresAt = new Date(Date.now() - 1000);
    await service.handleUpdate(message('/start abc123'));
    expect(link.chatId).toBeNull();
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('expired');
  });

  it('refuses an unknown token', async () => {
    await service.handleUpdate(message('/start nope'));
    expect(link.chatId).toBeNull();
  });

  it('only links from private chats', async () => {
    await service.handleUpdate(message('/start abc123', 'group'));
    expect(link.chatId).toBeNull();
  });

  it('/stop disconnects the chat', async () => {
    link.chatId = '555';
    await service.handleUpdate(message('/stop'));
    expect(link.chatId).toBeNull();
  });

  it('ignores ordinary messages and never throws', async () => {
    await service.handleUpdate(message('hello'));
    await service.handleUpdate({} as any);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    prisma.telegramLink.findFirst.mockRejectedValueOnce(new Error('db down'));
    await expect(service.handleUpdate(message('/start abc123'))).resolves.toBeUndefined();
  });

  it('reports alerts as on until the user turns them off', async () => {
    link.chatId = '555';
    const status = await service.getStatus('u1');
    expect(status).toMatchObject({ linked: true, dailyReminder: true, missedDayAlert: true });
    expect(status.schedule).toEqual({
      dailyReminder: '15:00',
      missedDayAlert: '23:30',
      timeZone: 'Asia/Kolkata',
    });
  });
});

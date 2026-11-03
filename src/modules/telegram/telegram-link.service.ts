import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import {
  DAILY_REMINDER_TIME,
  DEFAULT_REMINDER_TIMEZONE,
  MISSED_DAY_ALERT_TIME,
} from './telegram-schedule';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string };
    from?: { username?: string; first_name?: string };
  };
}

/** Connecting a user's account to their Telegram chat, and the bot's replies to /start and /stop. */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private config: ConfigService,
  ) {}

  async getStatus(userId: string) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    const pending =
      !!link?.linkToken && !!link.linkTokenExpiresAt && link.linkTokenExpiresAt > new Date();
    return {
      configured: this.telegram.isConfigured,
      botUsername: await this.telegram.botUsername(),
      linked: !!link?.chatId,
      username: link?.username ?? null,
      linkedAt: link?.linkedAt ?? null,
      linkPending: pending && !link?.chatId,
      dailyReminder: link?.dailyReminder !== false,
      missedDayAlert: link?.missedDayAlert !== false,
      schedule: {
        dailyReminder: DAILY_REMINDER_TIME,
        missedDayAlert: MISSED_DAY_ALERT_TIME,
        timeZone: this.config.get<string>('REMINDER_TIMEZONE') || DEFAULT_REMINDER_TIMEZONE,
      },
    };
  }

  /** A one-time t.me deep link; pressing Start on it sends the token back via the webhook. */
  async createLink(userId: string) {
    if (!this.telegram.isConfigured) {
      throw new BadRequestException('Telegram alerts are not set up on this server');
    }
    const botUsername = await this.telegram.botUsername();
    if (!botUsername) throw new BadRequestException('Could not reach the Telegram bot');

    const linkToken = randomBytes(16).toString('hex'); // [0-9a-f]{32}: a valid /start payload
    const linkTokenExpiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
    await this.prisma.telegramLink.upsert({
      where: { userId },
      create: { userId, linkToken, linkTokenExpiresAt } as any,
      update: { linkToken, linkTokenExpiresAt },
    });
    return {
      deepLink: `https://t.me/${botUsername}?start=${linkToken}`,
      botUsername,
      expiresAt: linkTokenExpiresAt,
    };
  }

  async updatePreferences(
    userId: string,
    dto: { dailyReminder?: boolean; missedDayAlert?: boolean },
  ) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link?.chatId) throw new NotFoundException('Connect Telegram first');
    await this.prisma.telegramLink.update({
      where: { userId },
      data: {
        ...(dto.dailyReminder !== undefined && { dailyReminder: dto.dailyReminder }),
        ...(dto.missedDayAlert !== undefined && { missedDayAlert: dto.missedDayAlert }),
      },
    });
    return this.getStatus(userId);
  }

  async unlink(userId: string) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (link) {
      await this.prisma.telegramLink.update({
        where: { userId },
        data: {
          chatId: null,
          username: null,
          linkToken: null,
          linkTokenExpiresAt: null,
          linkedAt: null,
        },
      });
    }
    return this.getStatus(userId);
  }

  async sendTest(userId: string) {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    if (!link?.chatId) throw new NotFoundException('Connect Telegram first');
    await this.telegram.sendMessage(
      link.chatId,
      '✅ <b>Test message</b>\nTelegram alerts from Longevity are working.',
    );
    return { sent: true };
  }

  /** Handles one update from the bot webhook. Never throws: Telegram retries failed deliveries. */
  async handleUpdate(update: TelegramUpdate) {
    const message = update?.message;
    const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
    const text = message?.text?.trim() ?? '';
    if (!chatId || !text.startsWith('/')) return;

    try {
      if (message?.chat?.type && message.chat.type !== 'private') {
        await this.reply(chatId, 'Please message me in a private chat to connect your account.');
        return;
      }

      const [command, payload] = text.split(/\s+/, 2);
      const name = command.split('@')[0].toLowerCase();

      if (name === '/start' && payload)
        return await this.completeLink(chatId, payload, message?.from?.username);
      if (name === '/stop') return await this.stopFromChat(chatId);
      await this.reply(
        chatId,
        'To get logging reminders here, open <b>Longevity → Settings → Telegram</b> and press <b>Connect Telegram</b>.\nSend /stop to turn reminders off.',
      );
    } catch (err) {
      this.logger.error(`Telegram update handling failed: ${(err as Error).message}`);
    }
  }

  private async completeLink(chatId: string, token: string, username?: string) {
    // Webhook calls carry no user, so this lookup is across tenants — the token is the secret.
    const link = await this.prisma.telegramLink.findFirst({ where: { linkToken: token } });
    if (!link || !link.linkTokenExpiresAt || link.linkTokenExpiresAt < new Date()) {
      await this.reply(
        chatId,
        'That link has expired. Go back to Settings and press <b>Connect Telegram</b> again.',
      );
      return;
    }
    await this.prisma.telegramLink.update({
      where: { id: link.id },
      data: {
        chatId,
        username: username ?? null,
        linkToken: null,
        linkTokenExpiresAt: null,
        linkedAt: new Date(),
      },
    });
    await this.reply(
      chatId,
      `🎉 <b>Connected!</b>\nI'll remind you at ${this.formatTime(DAILY_REMINDER_TIME)} if today isn't logged yet, and at ${this.formatTime(MISSED_DAY_ALERT_TIME)} if the day is about to be missed.\n\nSend /stop any time to turn this off.`,
    );
  }

  private async stopFromChat(chatId: string) {
    const links = await this.prisma.telegramLink.findMany({ where: { chatId } });
    for (const link of links) {
      await this.prisma.telegramLink.update({
        where: { id: link.id },
        data: { chatId: null, username: null, linkedAt: null },
      });
    }
    await this.reply(
      chatId,
      links.length
        ? 'Reminders are off and this chat is disconnected. You can reconnect from Settings any time.'
        : "This chat isn't connected to an account.",
    );
  }

  private formatTime(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    const zone = this.config.get<string>('REMINDER_TIMEZONE') || DEFAULT_REMINDER_TIMEZONE;
    const suffix = zone === DEFAULT_REMINDER_TIMEZONE ? ' IST' : ` (${zone})`;
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}${suffix}`;
  }

  private reply(chatId: string, html: string) {
    return this.telegram.sendMessage(chatId, html);
  }
}

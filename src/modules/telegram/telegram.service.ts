import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class TelegramApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** The user blocked the bot or deleted the chat; messaging them again will keep failing. */
  get chatIsGone() {
    return this.status === 403 || (this.status === 400 && /chat not found/i.test(this.message));
  }
}

export interface MessageButton {
  text: string;
  url: string;
}

/** Thin client for the Telegram Bot API (https://core.telegram.org/bots/api). */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private usernamePromise: Promise<string | null> | null = null;

  constructor(private config: ConfigService) {}

  private get token() {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
  }

  // Overridable so tests (and local development) can point at a stand-in server.
  private get apiBase() {
    return this.config.get<string>('TELEGRAM_API_BASE') || 'https://api.telegram.org';
  }

  get isConfigured() {
    return !!this.token;
  }

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      description?: string;
    } | null;
    if (!res.ok || !data?.ok) {
      throw new TelegramApiError(res.status, data?.description || `Telegram ${method} failed`);
    }
    return data.result as T;
  }

  /** The bot's @username, from TELEGRAM_BOT_USERNAME or looked up once via getMe. */
  botUsername(): Promise<string | null> {
    const configured = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (configured) return Promise.resolve(configured.replace(/^@/, ''));
    if (!this.isConfigured) return Promise.resolve(null);
    this.usernamePromise ??= this.call<{ username?: string }>('getMe')
      .then((me) => me.username ?? null)
      .catch((err) => {
        this.logger.warn(`getMe failed: ${err.message}`);
        this.usernamePromise = null; // try again next time
        return null;
      });
    return this.usernamePromise;
  }

  /**
   * Sends an HTML-formatted message. Telegram only accepts https URLs on buttons, so with a
   * plain-http app URL (local development) the links are written into the text instead.
   */
  async sendMessage(chatId: string, html: string, buttons: MessageButton[] = []) {
    const usable = buttons.filter((b) => b.url.startsWith('https://'));
    const inline = buttons.filter((b) => !b.url.startsWith('https://'));
    const text = inline.length
      ? `${html}\n\n${inline.map((b) => `${escapeHtml(b.text)}: ${escapeHtml(b.url)}`).join('\n')}`
      : html;
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(usable.length && {
        reply_markup: { inline_keyboard: usable.map((b) => [{ text: b.text, url: b.url }]) },
      }),
    });
  }
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

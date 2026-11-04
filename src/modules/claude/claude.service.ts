import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * The Anthropic API client for Claude-powered features. Separate from the OpenAI client in
 * the `ai` module; nothing here touches it. Configured by ANTHROPIC_API_KEY (and optionally
 * CLAUDE_MODEL); without a key, Claude features report themselves as unavailable.
 */
@Injectable()
export class ClaudeService {
  private client: Anthropic | null = null;

  constructor(private config: ConfigService) {}

  get isConfigured() {
    return !!this.config.get<string>('ANTHROPIC_API_KEY');
  }

  get model() {
    return this.config.get<string>('CLAUDE_MODEL') || DEFAULT_CLAUDE_MODEL;
  }

  /** Created on first use so the app boots (and tests run) without a key. */
  get anthropic(): Anthropic {
    this.client ??= new Anthropic({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY') });
    return this.client;
  }
}

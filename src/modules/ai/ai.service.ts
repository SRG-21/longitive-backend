import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.openai.apiKey');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async generateCompletion(systemPrompt: string, userMessage: string): Promise<string> {
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.configService.get<string>('ai.openai.model') || 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        this.logger.warn('OpenAI failed, falling back to Ollama', error);
        return this.generateOllamaCompletion(systemPrompt, userMessage);
      }
    }
    return this.generateOllamaCompletion(systemPrompt, userMessage);
  }

  async generateChatCompletion(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.configService.get<string>('ai.openai.model') || 'gpt-4',
          messages,
          temperature: 0.7,
          max_tokens: 2000,
        });
        return response.choices[0]?.message?.content || '';
      } catch (error) {
        this.logger.warn('OpenAI chat failed, falling back to Ollama');
        return this.generateOllamaCompletion(
          messages.find((m) => m.role === 'system')?.content || '',
          messages
            .filter((m) => m.role !== 'system')
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n'),
        );
      }
    }
    return this.generateOllamaCompletion(
      messages.find((m) => m.role === 'system')?.content || '',
      messages
        .filter((m) => m.role !== 'system')
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n'),
    );
  }

  private async generateOllamaCompletion(system: string, user: string): Promise<string> {
    const baseUrl = this.configService.get<string>('ai.ollama.baseUrl');
    const model = this.configService.get<string>('ai.ollama.model');

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system,
          prompt: user,
          stream: false,
        }),
      });
      const data = await response.json();
      return data.response || '';
    } catch (error) {
      this.logger.error('Ollama also failed', error);
      return 'AI service is currently unavailable. Please try again later.';
    }
  }
}

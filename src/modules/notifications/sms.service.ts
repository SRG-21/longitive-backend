import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private configService: ConfigService) {}

  async sendSms(to: string, message: string) {
    const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
    const from = this.configService.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio not configured');
      return { success: false, error: 'SMS not configured' };
    }

    try {
      // Dynamic import to avoid crash if not configured
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({ body: message, from, to });
      return { success: true, sid: result.sid };
    } catch (error) {
      this.logger.error('Failed to send SMS', error);
      return { success: false, error: (error as Error).message };
    }
  }
}

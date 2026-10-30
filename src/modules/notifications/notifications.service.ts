import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId } });
  }

  async updatePreferences(userId: string, channel: string, data: any) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel: channel as any } },
      create: { userId, channel: channel as any, ...data },
      update: data,
    });
  }

  async sendNotification(userId: string, title: string, message: string) {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId, enabled: true },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const results: any[] = [];
    for (const pref of prefs) {
      if (this.isQuietHours(pref.quietHoursStart, pref.quietHoursEnd)) continue;

      switch (pref.channel) {
        case 'PUSH':
          results.push(await this.pushService.sendPush('token', title, message));
          break;
        case 'EMAIL':
          results.push(await this.emailService.sendEmail(user.email, title, message));
          break;
        case 'SMS':
          if (user.phone)
            results.push(await this.smsService.sendSms(user.phone, `${title}: ${message}`));
          break;
      }
    }
    return results;
  }

  async testNotification(userId: string) {
    return this.sendNotification(userId, 'Test Notification', 'This is a test from Longevity App');
  }

  private isQuietHours(start?: string | null, end?: string | null): boolean {
    if (!start || !end) return false;
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    return currentTime >= start && currentTime <= end;
  }
}

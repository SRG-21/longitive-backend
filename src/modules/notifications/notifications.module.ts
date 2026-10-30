import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, EmailService, SmsService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}

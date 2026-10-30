import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { UpdatePreferenceDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get('preferences')
  getPreferences(@CurrentUser('id') userId: string) {
    return this.service.getPreferences(userId);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser('id') userId: string, @Body() dto: UpdatePreferenceDto) {
    const { channel, ...data } = dto;
    return this.service.updatePreferences(userId, channel, data);
  }

  @Post('test')
  test(@CurrentUser('id') userId: string) {
    return this.service.testNotification(userId);
  }
}

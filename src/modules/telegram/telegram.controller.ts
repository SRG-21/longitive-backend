import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';
import { isDay } from '../journey-tracker/tracker-dates';
import { UpdateTelegramPreferencesDto } from './dto/telegram.dto';
import { TelegramAlertsService } from './telegram-alerts.service';
import { TelegramLinkService } from './telegram-link.service';
import { AlertKind } from './telegram-schedule';

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private links: TelegramLinkService,
    private alerts: TelegramAlertsService,
    private config: ConfigService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  status(@CurrentUser('id') userId: string) {
    return this.links.getStatus(userId);
  }

  @Post('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  createLink(@CurrentUser('id') userId: string) {
    return this.links.createLink(userId);
  }

  @Delete('link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  unlink(@CurrentUser('id') userId: string) {
    return this.links.unlink(userId);
  }

  @Patch('preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updatePreferences(@CurrentUser('id') userId: string, @Body() dto: UpdateTelegramPreferencesDto) {
    return this.links.updatePreferences(userId, dto);
  }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  sendTest(@CurrentUser('id') userId: string) {
    return this.links.sendTest(userId);
  }

  /**
   * Telegram's webhook. Register it once with setWebhook, passing TELEGRAM_WEBHOOK_SECRET as
   * secret_token; Telegram then sends that value in this header on every update.
   */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Record<string, any>,
  ) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (!expected) throw new ServiceUnavailableException('Telegram webhook is not configured');
    if (!secret || !safeEqual(secret, expected)) throw new UnauthorizedException();
    await this.links.handleUpdate(update);
    return { ok: true };
  }

  // Vercel Cron sends GET requests with "Authorization: Bearer $CRON_SECRET".
  @Get('cron/daily-reminder')
  @SkipThrottle()
  @ApiExcludeEndpoint()
  dailyReminder(@Headers('authorization') auth: string | undefined, @Query('day') day?: string) {
    return this.runCron('daily', auth, day);
  }

  @Get('cron/missed-day')
  @SkipThrottle()
  @ApiExcludeEndpoint()
  missedDay(@Headers('authorization') auth: string | undefined, @Query('day') day?: string) {
    return this.runCron('missed', auth, day);
  }

  private runCron(kind: AlertKind, auth: string | undefined, day?: string) {
    const secret = this.config.get<string>('CRON_SECRET');
    if (!secret) throw new ServiceUnavailableException('CRON_SECRET is not configured');
    if (!auth || !safeEqual(auth, `Bearer ${secret}`)) throw new UnauthorizedException();
    // ?day=YYYY-MM-DD re-runs a specific day (e.g. after an outage); duplicates are still skipped.
    if (day !== undefined && !isDay(day)) throw new BadRequestException('day must be YYYY-MM-DD');
    return this.alerts.run(kind, { day });
  }
}

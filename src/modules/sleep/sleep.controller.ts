import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SleepService } from './sleep.service';
import { CreateSleepLogDto, CreateMoodLogDto, DateRangeQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Sleep & Wellness')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SleepController {
  constructor(private service: SleepService) {}

  @Post('sleep/log')
  createSleepLog(@CurrentUser('id') userId: string, @Body() dto: CreateSleepLogDto) {
    return this.service.createSleepLog(userId, dto);
  }

  @Get('sleep/log')
  getSleepLogs(@CurrentUser('id') userId: string, @Query() query: DateRangeQueryDto) {
    return this.service.getSleepLogs(userId, query.from, query.to);
  }

  @Get('sleep/score')
  getSleepScore(@CurrentUser('id') userId: string) {
    return this.service.getSleepScore(userId);
  }

  @Post('mood/log')
  createMoodLog(@CurrentUser('id') userId: string, @Body() dto: CreateMoodLogDto) {
    return this.service.createMoodLog(userId, dto);
  }

  @Get('mood/log')
  getMoodLogs(@CurrentUser('id') userId: string, @Query() query: DateRangeQueryDto) {
    return this.service.getMoodLogs(userId, query.from, query.to);
  }
}

import { Controller, Get, Put, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TrackerEntryService } from './tracker-entry.service';
import { UpsertEntryDto, EntryQueryDto, TodayQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Journey Tracker Entries')
@Controller('journey-trackers/:trackerId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TrackerEntryController {
  constructor(private service: TrackerEntryService) {}

  @Get('entries/export.csv')
  async exportCsv(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(userId, trackerId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tracker-${trackerId}.csv"`);
    res.send(csv);
  }

  @Get('entries')
  list(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Query() query: EntryQueryDto,
  ) {
    return this.service.list(userId, trackerId, query.from, query.to);
  }

  @Get('entries/:date')
  getByDate(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Param('date') date: string,
  ) {
    return this.service.getByDate(userId, trackerId, date);
  }

  @Put('entries/:date')
  upsert(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Param('date') date: string,
    @Body() dto: UpsertEntryDto,
  ) {
    return this.service.upsert(userId, trackerId, date, dto);
  }

  @Get('chart')
  getChartData(@CurrentUser('id') userId: string, @Param('trackerId') trackerId: string) {
    return this.service.getChartData(userId, trackerId);
  }

  @Get('weekly-review')
  getWeeklyReview(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Query() query: TodayQueryDto,
  ) {
    return this.service.getWeeklyReview(userId, trackerId, query.today);
  }

  @Get('logging-status')
  getLoggingStatus(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Query() query: TodayQueryDto,
  ) {
    return this.service.getLoggingStatus(userId, trackerId, query.today);
  }
}

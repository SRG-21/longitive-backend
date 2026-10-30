import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { ChecklistService } from './checklist.service';
import { RemindersService } from './reminders.service';
import { UpdateChecklistDto, CreateReminderDto, UpdateReminderDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Progress')
@Controller('progress')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProgressController {
  constructor(
    private progressService: ProgressService,
    private checklistService: ChecklistService,
    private remindersService: RemindersService,
  ) {}

  @Get('daily/:date')
  getDaily(@CurrentUser('id') userId: string, @Param('date') date: string) {
    return this.checklistService.getDaily(userId, date);
  }

  @Patch('daily/:date')
  updateDaily(
    @CurrentUser('id') userId: string,
    @Param('date') date: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.checklistService.updateDaily(userId, date, dto.items);
  }

  @Get('streaks')
  getStreaks(@CurrentUser('id') userId: string) {
    return this.progressService.getStreaks(userId);
  }

  @Get('score/:date')
  getScore(@CurrentUser('id') userId: string, @Param('date') date: string) {
    return this.progressService.getScore(userId, date);
  }

  @Get('weekly-report')
  getWeeklyReport(@CurrentUser('id') userId: string) {
    return this.progressService.getWeeklyReport(userId);
  }
}

@ApiTags('Reminders')
@Controller('reminders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RemindersController {
  constructor(private remindersService: RemindersService) {}

  @Get()
  getAll(@CurrentUser('id') userId: string) {
    return this.remindersService.getAll(userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReminderDto) {
    return this.remindersService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(userId, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.remindersService.delete(userId, id);
  }
}

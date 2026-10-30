import { Module } from '@nestjs/common';
import { ProgressController, RemindersController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ChecklistService } from './checklist.service';
import { RemindersService } from './reminders.service';

@Module({
  controllers: [ProgressController, RemindersController],
  providers: [ProgressService, ChecklistService, RemindersService],
  exports: [ProgressService, ChecklistService],
})
export class ProgressModule {}

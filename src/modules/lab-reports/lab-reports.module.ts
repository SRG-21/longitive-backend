import { Module } from '@nestjs/common';
import { LabReportsController } from './lab-reports.controller';
import { LabReportsService } from './lab-reports.service';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [OcrModule],
  controllers: [LabReportsController],
  providers: [LabReportsService],
  exports: [LabReportsService],
})
export class LabReportsModule {}

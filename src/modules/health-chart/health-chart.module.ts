import { Module } from '@nestjs/common';
import { DietController } from './diet.controller';
import { DietService } from './diet.service';
import { SupplementService } from './supplement.service';
import { HydrationService } from './hydration.service';
import { DailyChartService } from './daily-chart.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DietController],
  providers: [DietService, SupplementService, HydrationService, DailyChartService],
  exports: [DietService, SupplementService, HydrationService, DailyChartService],
})
export class HealthChartModule {}

import { Controller, Get, Post, Patch, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DietService } from './diet.service';
import { SupplementService } from './supplement.service';
import { HydrationService } from './hydration.service';
import { DailyChartService } from './daily-chart.service';
import { GenerateDietDto, UpdateDietDto, GenerateHydrationDto, GenerateDailyChartDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Health Chart')
@Controller('health-chart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DietController {
  constructor(
    private dietService: DietService,
    private supplementService: SupplementService,
    private hydrationService: HydrationService,
    private dailyChartService: DailyChartService,
  ) {}

  @Post('diet/generate')
  generateDiet(@CurrentUser('id') userId: string, @Body() dto: GenerateDietDto) {
    return this.dietService.generate(userId, dto.preferences, dto.targetCalories);
  }

  @Get('diet')
  getDiet(@CurrentUser('id') userId: string) {
    return this.dietService.getCurrent(userId);
  }

  @Patch('diet')
  updateDiet(@CurrentUser('id') userId: string, @Body() dto: UpdateDietDto) {
    return this.dietService.update(userId, dto);
  }

  @Post('supplements/generate')
  generateSupplements(@CurrentUser('id') userId: string) {
    return this.supplementService.generate(userId);
  }

  @Get('supplements')
  getSupplements(@CurrentUser('id') userId: string) {
    return this.supplementService.getCurrent(userId);
  }

  @Post('hydration/generate')
  generateHydration(@CurrentUser('id') userId: string, @Body() dto: GenerateHydrationDto) {
    return this.hydrationService.generate(userId, dto.dailyTarget);
  }

  @Get('hydration')
  getHydration(@CurrentUser('id') userId: string) {
    return this.hydrationService.getCurrent(userId);
  }

  @Get('daily/:date')
  getDailyChart(@CurrentUser('id') userId: string, @Param('date') date: string) {
    return this.dailyChartService.getDaily(userId, date);
  }

  @Post('daily/generate')
  generateDailyChart(@CurrentUser('id') userId: string, @Body() dto: GenerateDailyChartDto) {
    return this.dailyChartService.generate(userId, dto.date);
  }
}

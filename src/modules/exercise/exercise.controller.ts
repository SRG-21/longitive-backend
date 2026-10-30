import { Controller, Get, Post, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ExerciseService } from './exercise.service';
import {
  GenerateExercisePlanDto,
  UpdateExercisePlanDto,
  CreateExerciseLogDto,
  ExerciseQueryDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Exercise')
@Controller('exercise')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExerciseController {
  constructor(private service: ExerciseService) {}

  @Post('plan/generate')
  generatePlan(@CurrentUser('id') userId: string, @Body() dto: GenerateExercisePlanDto) {
    return this.service.generatePlan(userId, dto.goal, dto.equipmentLevel);
  }

  @Get('plan')
  getPlan(@CurrentUser('id') userId: string) {
    return this.service.getCurrentPlan(userId);
  }

  @Patch('plan')
  updatePlan(@CurrentUser('id') userId: string, @Body() dto: UpdateExercisePlanDto) {
    return this.service.updatePlan(userId, dto);
  }

  @Post('log')
  createLog(@CurrentUser('id') userId: string, @Body() dto: CreateExerciseLogDto) {
    return this.service.createLog(userId, dto);
  }

  @Get('log')
  getLogs(@CurrentUser('id') userId: string, @Query() query: ExerciseQueryDto) {
    return this.service.getLogs(userId, query.from, query.to);
  }

  @Get('stats')
  getStats(@CurrentUser('id') userId: string) {
    return this.service.getStats(userId);
  }
}

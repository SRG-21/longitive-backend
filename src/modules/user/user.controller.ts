import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import {
  UpdateProfileDto,
  CreateMedicalConditionDto,
  CreateFamilyHistoryDto,
  CreateTreatmentDto,
  UpdateLifestyleDto,
  UpdateGoalsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get('me/medical-conditions')
  getMedicalConditions(@CurrentUser('id') userId: string) {
    return this.userService.getMedicalConditions(userId);
  }

  @Post('me/medical-conditions')
  createMedicalCondition(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMedicalConditionDto,
  ) {
    return this.userService.createMedicalCondition(userId, dto);
  }

  @Get('me/family-history')
  getFamilyHistory(@CurrentUser('id') userId: string) {
    return this.userService.getFamilyHistory(userId);
  }

  @Post('me/family-history')
  createFamilyHistory(@CurrentUser('id') userId: string, @Body() dto: CreateFamilyHistoryDto) {
    return this.userService.createFamilyHistory(userId, dto);
  }

  @Get('me/treatments')
  getTreatments(@CurrentUser('id') userId: string) {
    return this.userService.getTreatments(userId);
  }

  @Post('me/treatments')
  createTreatment(@CurrentUser('id') userId: string, @Body() dto: CreateTreatmentDto) {
    return this.userService.createTreatment(userId, dto);
  }

  @Get('me/lifestyle')
  getLifestyle(@CurrentUser('id') userId: string) {
    return this.userService.getLifestyle(userId);
  }

  @Patch('me/lifestyle')
  updateLifestyle(@CurrentUser('id') userId: string, @Body() dto: UpdateLifestyleDto) {
    return this.userService.updateLifestyle(userId, dto);
  }

  @Get('me/goals')
  getGoals(@CurrentUser('id') userId: string) {
    return this.userService.getGoals(userId);
  }

  @Patch('me/goals')
  updateGoals(@CurrentUser('id') userId: string, @Body() dto: UpdateGoalsDto) {
    return this.userService.updateGoals(userId, dto);
  }
}

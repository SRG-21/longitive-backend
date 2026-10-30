import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateExercisePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() goal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() equipmentLevel?: string;
}

export class UpdateExercisePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() goal?: string;
  @ApiPropertyOptional() @IsOptional() weeklySchedule?: any;
  @ApiPropertyOptional() @IsOptional() @IsString() equipmentLevel?: string;
}

export class CreateExerciseLogDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() exerciseType: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() duration?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() intensity?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heartRateAvg?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ExerciseQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

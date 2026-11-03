import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dob?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bloodGroup?: string;
}

export class CreateMedicalConditionDto {
  @ApiProperty() @IsString() condition: string;
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() severity?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() diagnosedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateFamilyHistoryDto {
  @ApiProperty() @IsString() relation: string;
  @ApiProperty() @IsString() condition: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() ageOfOnset?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateTreatmentDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() prescribedBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateLifestyleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() smoking?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() alcohol?: string;
  @ApiPropertyOptional() @IsOptional() sleepHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10) stressLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() occupation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() activityLevel?: string;
}

export class UpdateGoalsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetWeightKg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetBodyFatPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetWaistCm?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetSleepHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetDailySteps?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetWaterIntakeMl?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

import {
  IsOptional,
  IsNumber,
  IsDateString,
  IsString,
  IsInt,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BodySegmentDto {
  @ApiPropertyOptional({ description: 'kg' }) @IsOptional() @IsNumber() mass?: number;
  @ApiPropertyOptional({ description: '% of standard' }) @IsOptional() @IsNumber() percent?: number;
}

export class BodySegmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentDto)
  leftArm?: BodySegmentDto;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentDto)
  rightArm?: BodySegmentDto;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentDto)
  trunk?: BodySegmentDto;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentDto)
  leftLeg?: BodySegmentDto;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentDto)
  rightLeg?: BodySegmentDto;
}

export class CreateBodyCompositionDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() height?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bmi?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bodyFat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() visceralFat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() subcutaneousFat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() muscleMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() boneMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bodyWater?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bmr?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() metabolicAge?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() waist?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() hip?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() chest?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bloodPressureSystolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bloodPressureDiastolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() spo2?: number;
  @ApiPropertyOptional({ example: '07:30:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/)
  measuredTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() age?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() bodyScore?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fatMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() bodyWaterMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() proteinMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() mineralMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() subcutaneousFatMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() skeletalMuscleMass?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() standardWeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weightControl?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fatControl?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() muscleControl?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) bodyType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentsDto)
  segmentalFat?: BodySegmentsDto;
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => BodySegmentsDto)
  segmentalMuscle?: BodySegmentsDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) deviceId?: string;
}

export class BodyCompQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CompareDto {
  @ApiProperty() @IsString() dates: string; // comma-separated dates
}

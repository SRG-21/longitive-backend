import { IsOptional, IsNumber, IsDateString, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

export class BodyCompQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CompareDto {
  @ApiProperty() @IsString() dates: string; // comma-separated dates
}

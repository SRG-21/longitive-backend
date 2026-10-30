import { IsOptional, IsNumber, IsDateString, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSleepLogDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bedtime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wakeTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() duration?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) quality?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateMoodLogDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) mood?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) energy?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(10) stressLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class DateRangeQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

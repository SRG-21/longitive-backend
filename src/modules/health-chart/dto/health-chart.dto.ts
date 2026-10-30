import { IsString, IsOptional, IsNumber, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateDietDto {
  @ApiPropertyOptional() @IsOptional() @IsObject() preferences?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetCalories?: number;
}

export class UpdateDietDto {
  @ApiPropertyOptional() @IsOptional() @IsObject() preferences?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsNumber() targetCalories?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() macroSplit?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() meals?: any;
}

export class GenerateSupplementDto {
  @ApiPropertyOptional() @IsOptional() @IsString() focus?: string;
}

export class GenerateHydrationDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() dailyTarget?: number;
}

export class GenerateDailyChartDto {
  @ApiProperty() @IsDateString() date: string;
}

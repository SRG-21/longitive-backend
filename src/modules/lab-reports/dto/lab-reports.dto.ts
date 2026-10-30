import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateLabTestResultDto {
  @ApiProperty() @IsString() testName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiProperty() @IsNumber() value: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() referenceMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() referenceMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateLabReportDto {
  @ApiProperty() @IsDateString() reportDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() labName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reportType?: string;
  @ApiProperty({ type: [CreateLabTestResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLabTestResultDto)
  results: CreateLabTestResultDto[];
}

export class LabReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
}

export class SpreadsheetQueryDto {
  @ApiProperty() @IsString() tests: string; // comma-separated test names
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

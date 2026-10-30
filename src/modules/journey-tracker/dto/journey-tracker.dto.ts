import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TrackerCadenceDto {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  CUSTOM = 'CUSTOM',
}

export enum TrackerFieldTypeDto {
  CHECKBOX = 'CHECKBOX',
  NUMBER = 'NUMBER',
  SHORT_TEXT = 'SHORT_TEXT',
  LONG_TEXT = 'LONG_TEXT',
  RATING = 'RATING',
  SINGLE_SELECT = 'SINGLE_SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  DATE = 'DATE',
  TIME = 'TIME',
  DURATION = 'DURATION',
  PHOTO = 'PHOTO',
  FORMULA = 'FORMULA',
}

export class TrackerFieldInputDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() label: string;
  @ApiProperty({ enum: TrackerFieldTypeDto }) @IsEnum(TrackerFieldTypeDto) type: TrackerFieldTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() target?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chartable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() scoringWeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateTrackerDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TrackerCadenceDto) cadence?: TrackerCadenceDto;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() baseline?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsObject() targets?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsObject() settings?: Record<string, any>;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackerFieldInputDto)
  fields?: TrackerFieldInputDto[];
}

export class UpdateTrackerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() baseline?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsObject() targets?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsObject() settings?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export class CreateFieldDto extends TrackerFieldInputDto {}

export class UpdateFieldDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TrackerFieldTypeDto) type?: TrackerFieldTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsObject() target?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chartable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() scoringWeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FieldOrderItemDto {
  @ApiProperty() @IsString() fieldId: string;
  @ApiProperty() @IsNumber() sortOrder: number;
}

export class ReorderFieldsDto {
  @ApiProperty({ type: [FieldOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOrderItemDto)
  order: FieldOrderItemDto[];
}

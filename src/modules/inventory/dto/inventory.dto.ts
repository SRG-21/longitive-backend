import { IsString, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInventoryItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() type: string; // MED | SUPPLEMENT
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dailyDosage?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() reorderThresholdDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() costPerUnit?: number;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dailyDosage?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() reorderThresholdDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
}

export class ConsumeDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() quantity?: number;
}

export class RestockDto {
  @ApiProperty() @IsNumber() quantity: number;
}

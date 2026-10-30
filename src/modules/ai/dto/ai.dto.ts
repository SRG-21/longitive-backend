import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessionId?: string;
}

export class GenerateInsightsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() focus?: string;
}

export class FirstAidDto {
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() severity?: string;
}

export class WhatIfDto {
  @ApiProperty() @IsString() scenario: string;
}

export class SummarizeSessionDto {
  // No body needed, session ID from param
}

import { IsObject, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertEntryDto {
  @ApiProperty() @IsObject() values: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
}

export class EntryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class TodayQueryDto {
  @ApiPropertyOptional({
    description: "The caller's local calendar day, YYYY-MM-DD (defaults to the server's UTC day)",
  })
  @IsOptional()
  @IsString()
  today?: string;
}

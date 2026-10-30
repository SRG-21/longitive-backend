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

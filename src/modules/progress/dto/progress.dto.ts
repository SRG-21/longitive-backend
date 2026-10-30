import { IsString, IsOptional, IsDateString, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChecklistDto {
  @ApiProperty() @IsArray() items: { task: string; completed: boolean; time?: string }[];
}

export class CreateReminderDto {
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiProperty() @IsString() cronExpression: string;
}

export class UpdateReminderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cronExpression?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

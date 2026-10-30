import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChecklistItemDto {
  @ApiProperty() @IsString() task: string;
  @ApiProperty() @IsBoolean() completed: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() time?: string;
}

export class UpdateChecklistDto {
  // Without an explicit nested type, the global ValidationPipe's implicit conversion
  // turns each plain-object item into an empty array and the checklist is wiped on save.
  @ApiProperty({ type: [ChecklistItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];
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

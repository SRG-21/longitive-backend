import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTelegramPreferencesDto {
  @ApiPropertyOptional({ description: 'The 3:00 pm "not logged yet" reminder' })
  @IsOptional()
  @IsBoolean()
  dailyReminder?: boolean;

  @ApiPropertyOptional({ description: 'The 11:30 pm "day about to be missed" alert' })
  @IsOptional()
  @IsBoolean()
  missedDayAlert?: boolean;

  @ApiPropertyOptional({ description: "Claude's weekly journey review" })
  @IsOptional()
  @IsBoolean()
  weeklyReview?: boolean;
}

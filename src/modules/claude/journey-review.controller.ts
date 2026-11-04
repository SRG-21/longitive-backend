import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { assertCronSecret } from '../../common/utils/secrets';
import { JwtAuthGuard } from '../auth/guards';
import { TodayQueryDto } from '../journey-tracker/dto';
import { isDay } from '../journey-tracker/tracker-dates';
import { JourneyReviewService } from './journey-review.service';

@ApiTags('Journey reviews (Claude)')
@Controller('journey-trackers/:trackerId/reviews')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JourneyReviewController {
  constructor(private reviews: JourneyReviewService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Param('trackerId') trackerId: string) {
    return this.reviews.list(userId, trackerId);
  }

  /** Asks Claude to review the week so far. */
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Param('trackerId') trackerId: string,
    @Query() query: TodayQueryDto,
  ) {
    if (query.today !== undefined && !isDay(query.today))
      throw new BadRequestException('today must be YYYY-MM-DD');
    return this.reviews.requestReview(userId, trackerId, query.today);
  }
}

@ApiTags('Journey reviews (Claude)')
@Controller('journey-reviews')
export class JourneyReviewCronController {
  constructor(
    private reviews: JourneyReviewService,
    private config: ConfigService,
  ) {}

  // Vercel Cron: GET with "Authorization: Bearer $CRON_SECRET". ?day=YYYY-MM-DD re-runs a day.
  @Get('cron/weekly')
  @SkipThrottle()
  @ApiExcludeEndpoint()
  weekly(@Headers('authorization') auth: string | undefined, @Query('day') day?: string) {
    assertCronSecret(this.config.get<string>('CRON_SECRET'), auth);
    if (day !== undefined && !isDay(day)) throw new BadRequestException('day must be YYYY-MM-DD');
    return this.reviews.runScheduled({ day });
  }
}

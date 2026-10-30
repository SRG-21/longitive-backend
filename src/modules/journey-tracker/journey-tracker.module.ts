import { Module } from '@nestjs/common';
import { JourneyTrackerController } from './journey-tracker.controller';
import { TrackerEntryController } from './tracker-entry.controller';
import { JourneyTrackerService } from './journey-tracker.service';
import { TrackerEntryService } from './tracker-entry.service';

@Module({
  controllers: [JourneyTrackerController, TrackerEntryController],
  providers: [JourneyTrackerService, TrackerEntryService],
  exports: [JourneyTrackerService, TrackerEntryService],
})
export class JourneyTrackerModule {}

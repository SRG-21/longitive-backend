import { Module } from '@nestjs/common';
import { BodyCompositionController } from './body-composition.controller';
import { BodyCompositionService } from './body-composition.service';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [OcrModule],
  controllers: [BodyCompositionController],
  providers: [BodyCompositionService],
  exports: [BodyCompositionService],
})
export class BodyCompositionModule {}

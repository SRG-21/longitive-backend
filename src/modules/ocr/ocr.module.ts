import { Module } from '@nestjs/common';
import { MistralOcrService } from './mistral-ocr.service';
import { OcrController } from './ocr.controller';
import { StorageModule } from '../../common/services';

@Module({
  imports: [StorageModule],
  controllers: [OcrController],
  providers: [MistralOcrService],
  exports: [MistralOcrService],
})
export class OcrModule {}

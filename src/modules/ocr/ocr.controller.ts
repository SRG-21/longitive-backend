import { Controller, Post, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { MistralOcrService } from './mistral-ocr.service';
import { JwtAuthGuard } from '../auth/guards';
import { ocrUploadInterceptorOptions, requireUpload } from '../../common/config/upload.config';
import { CurrentUser } from '../../common/decorators';

@ApiTags('OCR')
@Controller('ocr')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OcrController {
  constructor(private ocrService: MistralOcrService) {}

  @Post('process')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', ocrUploadInterceptorOptions))
  async process(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    const upload = requireUpload(file);
    return this.ocrService.processGeneric(upload.buffer, upload.mimetype, userId);
  }
}

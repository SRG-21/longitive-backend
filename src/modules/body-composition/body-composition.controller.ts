import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { BodyCompositionService } from './body-composition.service';
import { CreateBodyCompositionDto, BodyCompQueryDto, CompareDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';
import { ocrUploadInterceptorOptions } from '../../common/config/upload.config';

@ApiTags('Body Composition')
@Controller('body-composition')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BodyCompositionController {
  constructor(private service: BodyCompositionService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBodyCompositionDto) {
    return this.service.create(userId, dto);
  }

  @Post('ocr')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', ocrUploadInterceptorOptions))
  processOcr(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.createFromOcrUpload(userId, file.buffer, file.originalname, file.mimetype);
  }

  @Get()
  getHistory(@CurrentUser('id') userId: string, @Query() query: BodyCompQueryDto) {
    return this.service.getHistory(userId, query.from, query.to);
  }

  @Get('latest')
  getLatest(@CurrentUser('id') userId: string) {
    return this.service.getLatest(userId);
  }

  @Get('trends')
  getTrends(@CurrentUser('id') userId: string) {
    return this.service.getTrends(userId);
  }

  @Get('compare')
  compare(@CurrentUser('id') userId: string, @Query() query: CompareDto) {
    const dates = query.dates.split(',');
    return this.service.compare(userId, dates);
  }
}

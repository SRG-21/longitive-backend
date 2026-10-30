import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { LabReportsService } from './lab-reports.service';
import { CreateLabReportDto, LabReportQueryDto, SpreadsheetQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';
import { ocrUploadInterceptorOptions } from '../../common/config/upload.config';

@ApiTags('Lab Reports')
@Controller('lab-reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LabReportsController {
  constructor(private service: LabReportsService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateLabReportDto) {
    return this.service.create(userId, dto);
  }

  @Post('ocr')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', ocrUploadInterceptorOptions))
  processOcr(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.processMistralOcr(userId, file.buffer, file.originalname, file.mimetype);
  }

  @Post('pdf')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', ocrUploadInterceptorOptions))
  processPdf(@CurrentUser('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.processMistralOcr(userId, file.buffer, file.originalname, file.mimetype);
  }

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query() query: LabReportQueryDto) {
    return this.service.findAll(userId, query);
  }

  @Get('spreadsheet')
  getSpreadsheet(@CurrentUser('id') userId: string, @Query() query: SpreadsheetQueryDto) {
    const tests = query.tests.split(',');
    return this.service.getSpreadsheet(userId, tests, query.from, query.to);
  }

  @Get('trends/:testName')
  getTrends(@CurrentUser('id') userId: string, @Param('testName') testName: string) {
    return this.service.getTrends(userId, testName);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.findOne(userId, id);
  }

  @Patch(':id/verify')
  verify(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.verify(userId, id);
  }
}

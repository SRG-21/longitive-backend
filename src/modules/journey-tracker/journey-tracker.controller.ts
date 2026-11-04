import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JourneyTrackerService } from './journey-tracker.service';
import {
  CreateTrackerDto,
  UpdateTrackerDto,
  CreateFieldDto,
  UpdateFieldDto,
  ReorderFieldsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Journey Trackers')
@Controller('journey-trackers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JourneyTrackerController {
  constructor(private service: JourneyTrackerService) {}

  @Get('templates/weight-loss/preview')
  previewWeightLossTemplate(@CurrentUser('id') userId: string) {
    return this.service.previewWeightLossTemplate(userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTrackerDto) {
    return this.service.create(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.service.list(userId);
  }

  @Get(':id')
  getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getOne(userId, id);
  }

  @Patch(':id')
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateTrackerDto) {
    return this.service.update(userId, id, dto);
  }

  /** Permanently deletes the tracker with its fields and every logged entry. */
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }

  /** Hides the tracker but keeps all of its data. */
  @Post(':id/archive')
  archive(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.archive(userId, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.activate(userId, id);
  }

  @Post(':id/fields')
  addField(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: CreateFieldDto) {
    return this.service.addField(userId, id, dto);
  }

  @Patch(':id/fields/reorder')
  reorderFields(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReorderFieldsDto) {
    return this.service.reorderFields(userId, id, dto);
  }

  @Patch(':id/fields/:fieldId')
  updateField(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.service.updateField(userId, id, fieldId, dto);
  }

  @Delete(':id/fields/:fieldId')
  removeField(@CurrentUser('id') userId: string, @Param('id') id: string, @Param('fieldId') fieldId: string) {
    return this.service.removeField(userId, id, fieldId);
  }
}

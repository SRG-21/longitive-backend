import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto, ConsumeDto, RestockDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private service: InventoryService) {}

  @Get()
  getAll(@CurrentUser('id') userId: string) {
    return this.service.getAll(userId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateInventoryItemDto) {
    return this.service.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.service.update(userId, id, dto);
  }

  @Post(':id/consume')
  consume(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ConsumeDto) {
    return this.service.consume(userId, id, dto.quantity);
  }

  @Post(':id/restock')
  restock(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: RestockDto) {
    return this.service.restock(userId, id, dto.quantity);
  }

  @Get('reorder-alerts')
  reorderAlerts(@CurrentUser('id') userId: string) {
    return this.service.getReorderAlerts(userId);
  }

  @Get('expiring-soon')
  expiringSoon(@CurrentUser('id') userId: string) {
    return this.service.getExpiringSoon(userId);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto } from './dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getAll(userId: string) {
    return this.prisma.inventoryItem.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  async create(userId: string, dto: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as any,
        quantity: dto.quantity || 0,
        unit: dto.unit,
        dailyDosage: dto.dailyDosage,
        reorderThresholdDays: dto.reorderThresholdDays,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        costPerUnit: dto.costPerUnit,
      } as any,
    });
  }

  async update(userId: string, id: string, dto: UpdateInventoryItemDto) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException();
    return this.prisma.inventoryItem.update({
      where: { id },
      data: { ...dto, expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined },
    });
  }

  async consume(userId: string, id: string, quantity?: number) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException();

    const consumeQty = quantity || item.dailyDosage || 1;
    await this.prisma.inventoryItem.update({
      where: { id },
      data: { quantity: Math.max(0, item.quantity - consumeQty) },
    });

    await this.prisma.inventoryLog.create({
      data: { itemId: id, action: 'CONSUMED', quantity: consumeQty } as any,
    });

    return { remaining: Math.max(0, item.quantity - consumeQty) };
  }

  async restock(userId: string, id: string, quantity: number) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException();

    await this.prisma.inventoryItem.update({
      where: { id },
      data: { quantity: item.quantity + quantity },
    });

    await this.prisma.inventoryLog.create({
      data: { itemId: id, action: 'RESTOCKED', quantity } as any,
    });

    return { newQuantity: item.quantity + quantity };
  }

  async getReorderAlerts(userId: string) {
    const items = await this.prisma.inventoryItem.findMany({ where: { userId } });
    return items
      .filter((item) => {
        if (!item.dailyDosage || !item.reorderThresholdDays) return false;
        const daysRemaining = item.quantity / item.dailyDosage;
        return daysRemaining <= item.reorderThresholdDays;
      })
      .map((item) => ({
        ...item,
        daysRemaining: Math.floor(item.quantity / (item.dailyDosage || 1)),
      }));
  }

  async getExpiringSoon(userId: string) {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.prisma.inventoryItem.findMany({
      where: { userId, expiryDate: { lte: thirtyDays, gte: new Date() } },
      orderBy: { expiryDate: 'asc' },
    });
  }
}

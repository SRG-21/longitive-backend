import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto';

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async getAll(userId: string) {
    return this.prisma.scheduledReminder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateReminderDto) {
    return this.prisma.scheduledReminder.create({ data: { userId, ...dto } as any });
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    return this.prisma.scheduledReminder.updateMany({ where: { id, userId }, data: dto });
  }

  async delete(userId: string, id: string) {
    return this.prisma.scheduledReminder.deleteMany({ where: { id, userId } });
  }
}

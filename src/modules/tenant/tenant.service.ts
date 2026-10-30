import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { generateSlug } from '../../common/utils';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const slug = generateSlug(dto.name);
    if (dto.domain) {
      const existing = await this.prisma.tenant.findFirst({ where: { domain: dto.domain } });
      if (existing) throw new ConflictException('Domain already in use');
    }
    return this.prisma.tenant.create({
      data: { name: dto.name, slug, domain: dto.domain, plan: dto.plan || 'FREE' },
    });
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);
    if (dto.domain) {
      const existing = await this.prisma.tenant.findFirst({ where: { domain: dto.domain } });
      if (existing && existing.id !== id) throw new ConflictException('Domain already in use');
    }
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async getUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async inviteUser(tenantId: string, email: string, role?: string) {
    // TODO: Send invitation email
    return { message: `Invitation sent to ${email}`, tenantId, role: role || 'USER' };
  }
}

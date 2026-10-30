import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto, UpdateTenantDto, InviteUserDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

/** :id must match the caller's own JWT tenant — defense-in-depth on top of the Phase 2 RLS/extension scoping. */
function assertOwnTenant(userTenantId: string, id: string) {
  if (userTenantId !== id) throw new ForbiddenException('Cannot access another tenant');
}

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  findOne(@CurrentUser('tenantId') userTenantId: string, @Param('id') id: string) {
    assertOwnTenant(userTenantId, id);
    return this.tenantService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  update(
    @CurrentUser('tenantId') userTenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    assertOwnTenant(userTenantId, id);
    return this.tenantService.update(id, dto);
  }

  @Get(':id/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getUsers(@CurrentUser('tenantId') userTenantId: string, @Param('id') id: string) {
    assertOwnTenant(userTenantId, id);
    return this.tenantService.getUsers(id);
  }

  @Post(':id/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'PRACTITIONER')
  @ApiBearerAuth()
  invite(
    @CurrentUser('tenantId') userTenantId: string,
    @Param('id') id: string,
    @Body() dto: InviteUserDto,
  ) {
    assertOwnTenant(userTenantId, id);
    return this.tenantService.inviteUser(id, dto.email, dto.role);
  }
}

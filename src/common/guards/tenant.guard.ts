import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }
    // Verify user belongs to the tenant
    if (request.user && request.user.tenantId !== request.tenantId) {
      throw new ForbiddenException('User does not belong to this tenant');
    }
    return true;
  }
}

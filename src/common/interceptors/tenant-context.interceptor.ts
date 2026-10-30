import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, firstValueFrom } from 'rxjs';
import { tenantContext } from '../context/tenant-context';

/**
 * Establishes the per-request tenant context every tenant-scoped query relies
 * on (see PrismaService) — the authenticated user's tenantId, made available
 * to every service via AsyncLocalStorage without threading it through
 * explicit arguments.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return from(tenantContext.run({ tenantId }, () => firstValueFrom(next.handle())));
  }
}

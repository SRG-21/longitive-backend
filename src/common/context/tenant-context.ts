import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  tenantId: string;
}

/**
 * Carries the authenticated request's tenantId across async boundaries so
 * PrismaService can auto-scope every tenant-owned query without services
 * passing tenantId through explicit arguments. Populated by TenantContextInterceptor.
 */
export const tenantContext = new AsyncLocalStorage<TenantStore>();

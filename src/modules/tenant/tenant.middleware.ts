import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Extract tenant from header or subdomain
    const tenantId = req.headers['x-tenant-id'] as string;
    if (tenantId) {
      (req as any).tenantId = tenantId;
    } else {
      // Try subdomain extraction
      const host = req.headers.host || '';
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        (req as any).tenantSlug = subdomain;
      }
    }
    next();
  }
}

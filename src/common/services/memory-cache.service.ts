import { Injectable } from '@nestjs/common';

/**
 * Simple in-memory cache to replace Redis for small-scale deployments.
 * Suitable for up to ~50 concurrent users. No persistence across restarts.
 */
@Injectable()
export class MemoryCacheService {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds = 3600): Promise<void> {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async flush(): Promise<void> {
    this.cache.clear();
  }

  /** Periodic cleanup of expired keys (call from a cron or interval) */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }
}

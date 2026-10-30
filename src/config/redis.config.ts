import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  // 'memory' for monolithic/Vercel mode, 'redis' for full infra
  driver: process.env.CACHE_DRIVER || 'memory',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
}));

import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  // eco = Vercel serverless, no Redis. pro = long-running server, Redis-backed queues/throttling.
  mode: process.env.APP_MODE === 'pro' ? 'pro' : 'eco',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  jwtRefreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-byte-encryption-key-here',
  throttleTtl: parseInt(process.env.THROTTLE_TTL || '60', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
}));

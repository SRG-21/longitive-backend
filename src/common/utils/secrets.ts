import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Constant-time string comparison (different lengths are simply unequal). */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Guards a scheduled-job endpoint. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`;
 * with no secret configured the endpoint refuses to run at all.
 */
export function assertCronSecret(secret: string | undefined, authorization: string | undefined) {
  if (!secret) throw new ServiceUnavailableException('CRON_SECRET is not configured');
  if (!authorization || !safeEqual(authorization, `Bearer ${secret}`))
    throw new UnauthorizedException();
}

/** A URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored only as their SHA-256 hash. */
export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { RegisterDto, LoginDto, OAuthDto } from './dto';
import { JwtPayload } from '../../common/interfaces';

const PRE_2FA_TOKEN_TTL = '5m';
const APPLE_ISSUER = 'https://appleid.apple.com';

// `jose` ships ESM-only — a static import breaks under Jest and isn't safe to
// assume works via Node's require(esm) interop on every deployment target
// (e.g. Vercel's serverless runtime). Loaded lazily and cached, same as the
// Mistral SDK in mistral-ocr.service.ts.
let josePromise: Promise<typeof import('jose')> | null = null;
async function loadJose() {
  if (!josePromise) {
    josePromise = import('jose');
  }
  return josePromise;
}

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private appleJwks: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        tenantId: dto.tenantId,
        email: dto.email,
        name: dto.name,
        phone: dto.phone,
        passwordHash,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const where = dto.tenantId
      ? { tenantId_email: { tenantId: dto.tenantId, email: dto.email } }
      : undefined;

    const user = where
      ? await this.prisma.user.findUnique({ where })
      : await this.prisma.user.findFirst({ where: { email: dto.email } });

    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.twoFactorEnabled) {
      const preAuthToken = await this.jwtService.signAsync(
        { sub: user.id, type: 'pre_2fa' },
        { expiresIn: PRE_2FA_TOKEN_TTL },
      );
      return { requiresTwoFactor: true, userId: user.id, preAuthToken };
    }

    const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    };
  }

  /** Completes the login-challenge flow: exchanges the short-lived pre_2fa token + TOTP code for real tokens. */
  async loginWith2fa(preAuthToken: string, code: string) {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(preAuthToken, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired login challenge');
    }
    if (payload.type !== 'pre_2fa') throw new UnauthorizedException('Invalid login challenge');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.twoFactorSecret) throw new UnauthorizedException('Invalid login challenge');

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new UnauthorizedException('Invalid 2FA code');

    const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return this.generateTokens(user.id, user.email, user.tenantId, user.role);
  }

  async oauthLogin(dto: OAuthDto, provider: 'google' | 'apple') {
    const profile =
      provider === 'google'
        ? await this.verifyGoogleToken(dto.token)
        : await this.verifyAppleToken(dto.token);

    let user = await this.prisma.user.findFirst({
      where: { email: profile.email, oauthProvider: provider },
    });

    if (!user) {
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId is required to create a new account');
      }
      user = await this.prisma.user.create({
        data: {
          tenantId: dto.tenantId,
          email: profile.email,
          name: profile.name || profile.email,
          oauthProvider: provider,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    };
  }

  private async verifyGoogleToken(idToken: string): Promise<{ email: string; name?: string }> {
    const audience = this.configService.get<string>('GOOGLE_CLIENT_ID') || undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error('Token has no email claim');
      return { email: payload.email, name: payload.name };
    } catch {
      throw new BadRequestException('Invalid Google token');
    }
  }

  private async verifyAppleToken(idToken: string): Promise<{ email: string; name?: string }> {
    const audience = this.configService.get<string>('APPLE_CLIENT_ID') || undefined;
    try {
      const { jwtVerify, createRemoteJWKSet } = await loadJose();
      if (!this.appleJwks) {
        this.appleJwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));
      }
      const { payload } = await jwtVerify(idToken, this.appleJwks, {
        issuer: APPLE_ISSUER,
        audience,
      });
      if (typeof payload.email !== 'string') throw new Error('Token has no email claim');
      return {
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : undefined,
      };
    } catch {
      throw new BadRequestException('Invalid Apple token');
    }
  }

  async enable2fa(userId: string) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const otpauthUrl = authenticator.keyuri(user!.email, 'LongevityApp', secret);
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    return { secret, qrCode };
  }

  /** Confirms 2FA setup for an already-authenticated user (not the login-challenge flow — see loginWith2fa). */
  async verify2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw new BadRequestException('2FA not set up');

    const valid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
    if (!valid) throw new UnauthorizedException('Invalid 2FA code');

    if (!user.twoFactorEnabled) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });
    }

    return { message: '2FA enabled' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return { message: 'If account exists, reset email sent' };

    const token = await this.jwtService.signAsync({ sub: user.id, type: 'reset' }, { expiresIn: '1h' });
    const resetUrl = `${this.configService.get<string>('app.appUrl')}/reset-password?token=${token}`;
    await this.emailService.sendEmail(
      user.email,
      'Reset your password',
      `<p>Click the link below to reset your password. This link expires in 1 hour.</p>
       <p><a href="${resetUrl}">${resetUrl}</a></p>`,
    );
    return { message: 'If account exists, reset email sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'reset') throw new BadRequestException();
      const hash = await bcrypt.hash(newPassword, 12);
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { passwordHash: hash },
      });
      return { message: 'Password reset successfully' };
    } catch {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  private async generateTokens(userId: string, email: string, tenantId: string, role: string) {
    const basePayload = { sub: userId, email, tenantId, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, type: 'access' } satisfies JwtPayload,
        { expiresIn: this.configService.get<string>('app.jwtAccessExpiration') },
      ),
      this.jwtService.signAsync(
        { ...basePayload, type: 'refresh' } satisfies JwtPayload,
        { expiresIn: this.configService.get<string>('app.jwtRefreshExpiration') },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}

import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  OAuthDto,
  Verify2faDto,
  Login2faDto,
} from './dto';
import { JwtAuthGuard } from './guards';
import { CurrentUser } from '../../common/decorators';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/login')
  @Throttle(AUTH_THROTTLE)
  loginWith2fa(@Body() dto: Login2faDto) {
    return this.authService.loginWith2fa(dto.preAuthToken, dto.code);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('oauth/google')
  @Throttle(AUTH_THROTTLE)
  oauthGoogle(@Body() dto: OAuthDto) {
    return this.authService.oauthLogin(dto, 'google');
  }

  @Post('oauth/apple')
  @Throttle(AUTH_THROTTLE)
  oauthApple(@Body() dto: OAuthDto) {
    return this.authService.oauthLogin(dto, 'apple');
  }

  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle(AUTH_THROTTLE)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  enable2fa(@CurrentUser('id') userId: string) {
    return this.authService.enable2fa(userId);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  verify2fa(@CurrentUser('id') userId: string, @Body() dto: Verify2faDto) {
    return this.authService.verify2fa(userId, dto.code);
  }
}

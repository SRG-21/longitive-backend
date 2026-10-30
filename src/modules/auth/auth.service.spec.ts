import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    signAsync: jest.fn().mockResolvedValue('mock-token'),
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        'app.jwtSecret': 'test-secret',
        'app.jwtAccessExpiration': '15m',
        'app.jwtRefreshExpiration': '7d',
      };
      return config[key];
    }),
  };

  const mockEmail = {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw on duplicate registration', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@test.com' });
    await expect(
      service.register({
        email: 'test@test.com',
        password: 'pass1234',
        name: 'Test',
        tenantId: 't1',
      }),
    ).rejects.toThrow('Email already registered');
  });

  it('should register a new user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: '1',
      email: 'new@test.com',
      name: 'New',
      role: 'USER',
      tenantId: 't1',
    });
    const result = await service.register({
      email: 'new@test.com',
      password: 'pass1234',
      name: 'New',
      tenantId: 't1',
    });
    expect(result.user.email).toBe('new@test.com');
    expect(result.accessToken).toBe('mock-token');
  });
});

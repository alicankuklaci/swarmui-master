import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../users/schemas/user.schema';
import { RefreshToken } from './schemas/refresh-token.schema';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock_token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'JWT_ACCESS_SECRET') return 'secret';
      if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      if (key === 'NODE_ENV') return 'test';
      return defaultValue;
    }),
  };

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockRefreshTokenModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(RefreshToken.name), useValue: mockRefreshTokenModel },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return null if user not found', async () => {
      mockUserModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      const result = await service.validateUser('test', 'pwd');
      expect(result).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should throw UnauthorizedException if token not found', async () => {
      await expect(service.refreshAccessToken('')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token invalid', async () => {
      mockRefreshTokenModel.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null),
      });

      await expect(service.refreshAccessToken('invalid_token')).rejects.toThrow(UnauthorizedException);
    });
  });
});

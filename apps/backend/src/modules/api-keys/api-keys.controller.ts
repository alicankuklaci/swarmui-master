import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyScope } from './api-key.schema';

class CreateApiKeyDto {
  name: string;
  scope: ApiKeyScope[];
  expiresAt?: string | null;
}

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    const { key, apiKey } = await this.apiKeysService.generate(
      userId,
      dto.name,
      dto.scope,
      dto.expiresAt ? new Date(dto.expiresAt) : null,
    );
    return {
      key,
      id: apiKey._id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scope: apiKey.scope,
      expiresAt: apiKey.expiresAt,
      createdAt: (apiKey as any).createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys for current user' })
  async list(@CurrentUser('id') userId: string) {
    return this.apiKeysService.list(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id') id: string) {
    return this.apiKeysService.revoke(id);
  }
}

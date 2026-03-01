import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SecurityPolicyService } from './security-policy.service';
import { TrivyScanService } from './trivy-scan.service';
import { SecretsService } from './secrets.service';
import { ConfigsService } from './configs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller({ path: 'security', version: '1' })
export class SecurityController {
  constructor(
    private readonly policyService: SecurityPolicyService,
    private readonly trivyService: TrivyScanService,
    private readonly secretsService: SecretsService,
    private readonly configsService: ConfigsService,
  ) {}

  // Policies
  @Get('policies')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'List security policies' })
  listPolicies() {
    return this.policyService.findAll();
  }

  @Get('policies/:id')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Get security policy' })
  getPolicy(@Param('id') id: string) {
    return this.policyService.findOne(id);
  }

  @Post('policies')
  @Roles('admin')
  @ApiOperation({ summary: 'Create security policy' })
  createPolicy(@Body() dto: any, @CurrentUser('id') userId: string) {
    return this.policyService.create(dto, userId);
  }

  @Put('policies/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update security policy' })
  updatePolicy(@Param('id') id: string, @Body() dto: any) {
    return this.policyService.update(id, dto);
  }

  @Delete('policies/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete security policy' })
  deletePolicy(@Param('id') id: string) {
    return this.policyService.delete(id);
  }

  @Post('policies/:id/apply/:containerId')
  @Roles('admin')
  @ApiOperation({ summary: 'Apply policy to container' })
  applyPolicy(@Param('id') id: string, @Param('containerId') containerId: string) {
    return this.policyService.applyToContainer(id, containerId);
  }

  // Image scanning
  @Post('scan')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Scan Docker image with Trivy' })
  scanImage(@Body('image') image: string) {
    return this.trivyService.scanImage(image);
  }

  @Get('trivy/status')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'Check Trivy availability' })
  async trivyStatus() {
    const available = await this.trivyService.isTrivyAvailable();
    return { available };
  }

  // Secrets
  @Get('secrets')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'List Docker secrets' })
  listSecrets(@Query('endpointId') endpointId: string) {
    return this.secretsService.listSecrets(endpointId || 'local');
  }

  @Post('secrets')
  @Roles('admin')
  @ApiOperation({ summary: 'Create Docker secret' })
  createSecret(
    @Body() body: { name: string; value: string; labels?: Record<string, string> },
    @Query('endpointId') endpointId: string,
  ) {
    return this.secretsService.createSecret(endpointId || 'local', body.name, body.value, body.labels);
  }

  @Delete('secrets/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Docker secret' })
  deleteSecret(@Param('id') id: string, @Query('endpointId') endpointId: string) {
    return this.secretsService.deleteSecret(endpointId || 'local', id);
  }

  // Configs
  @Get('configs')
  @Roles('admin', 'operator')
  @ApiOperation({ summary: 'List Docker configs' })
  listConfigs(@Query('endpointId') endpointId: string) {
    return this.configsService.listConfigs(endpointId || 'local');
  }

  @Post('configs')
  @Roles('admin')
  @ApiOperation({ summary: 'Create Docker config' })
  createConfig(
    @Body() body: { name: string; value: string; labels?: Record<string, string> },
    @Query('endpointId') endpointId: string,
  ) {
    return this.configsService.createConfig(endpointId || 'local', body.name, body.value, body.labels);
  }

  @Delete('configs/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Docker config' })
  deleteConfig(@Param('id') id: string, @Query('endpointId') endpointId: string) {
    return this.configsService.deleteConfig(endpointId || 'local', id);
  }
}

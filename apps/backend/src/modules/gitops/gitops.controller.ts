import {
  Controller, Get, Post, Patch, Delete, Param, Body, Headers, UseGuards, RawBodyRequest, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GitopsService } from './gitops.service';
import { GitCredentialsService } from './git-credentials.service';
import {
  CreateGitopsDeploymentDto,
  UpdateGitopsDeploymentDto,
  CreateGitCredentialsDto,
} from './dto/gitops.dto';

@UseGuards(JwtAuthGuard)
@Controller('gitops')
export class GitopsController {
  constructor(
    private readonly gitopsService: GitopsService,
    private readonly gitCredentialsService: GitCredentialsService,
  ) {}

  // ─── Deployments ─────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.gitopsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gitopsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateGitopsDeploymentDto) {
    return this.gitopsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGitopsDeploymentDto) {
    return this.gitopsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gitopsService.remove(id);
  }

  @Post(':id/deploy')
  triggerDeploy(@Param('id') id: string) {
    return this.gitopsService.triggerDeploy(id);
  }

  @Get(':id/history')
  getDeployHistory(@Param('id') id: string) {
    return this.gitopsService.getDeployHistory(id);
  }

  // ─── Webhooks (public) ────────────────────────────────────────────────────

  @Public()
  @Post('webhooks/:token')
  handleWebhook(
    @Param('token') token: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    return this.gitopsService.handleWebhook(token, payload, headers);
  }

  // ─── Git Credentials ─────────────────────────────────────────────────────

  @Get('credentials/list')
  findAllCredentials() {
    return this.gitCredentialsService.findAll();
  }

  @Post('credentials')
  createCredentials(@Body() dto: CreateGitCredentialsDto) {
    return this.gitCredentialsService.create(dto);
  }

  @Delete('credentials/:id')
  removeCredentials(@Param('id') id: string) {
    return this.gitCredentialsService.remove(id);
  }
}

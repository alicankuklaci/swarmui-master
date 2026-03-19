import {
  Controller, Get, Post, Put, Delete, Param, Body,
  UseGuards, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { StacksService } from './stacks.service';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('endpoints/:endpointId/swarm/stacks')
@UseGuards(JwtAuthGuard, RbacGuard)
export class StacksController {
  constructor(private readonly stacksService: StacksService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.stacksService.list(endpointId);
  }

  @Post()
  @Roles('admin', 'operator')
  deploy(
    @Param('endpointId') endpointId: string,
    @Body() body: { name: string; composeContent: string },
  ) {
    return this.stacksService.deploy(body.name, body.composeContent, endpointId);
  }

  @Put(':name')
  @Roles('admin', 'operator')
  update(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Body() body: { composeContent: string },
  ) {
    return this.stacksService.update(name, body.composeContent, endpointId);
  }

  @Get(':name')
  inspect(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.inspect(name, endpointId);
  }

  @Get(':name/services')
  services(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.getServices(name, endpointId);
  }

  @Get(':name/tasks')
  tasks(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.getTasks(name, endpointId);
  }

  @Get(':name/compose')
  async getCompose(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    const content = await this.stacksService.getComposeFile(name, endpointId);
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  }

  @Delete(':name')
  @Roles('admin', 'operator')
  remove(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.remove(name, endpointId);
  }

  @Get(':name/webhook')
  @Roles('admin', 'operator')
  getWebhook(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.getWebhook(name, endpointId);
  }

  @Post(':name/webhook')
  @Roles('admin', 'operator')
  generateWebhook(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @CurrentUser() user: any,
  ) {
    return this.stacksService.generateWebhook(name, endpointId, user?.email || user?.username || 'unknown');
  }

  @Delete(':name/webhook')
  @Roles('admin', 'operator')
  revokeWebhook(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.revokeWebhook(name, endpointId);
  }

}

@Controller('webhooks/stacks')
export class StackWebhooksController {
  constructor(private readonly stacksService: StacksService) {}

  @Public()
  @Post(':token')
  @HttpCode(HttpStatus.OK)
  trigger(@Param('token') token: string) {
    return this.stacksService.triggerWebhook(token);
  }
}

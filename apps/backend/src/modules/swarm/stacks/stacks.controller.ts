import {
  Controller, Get, Post, Delete, Param, Body,
  UseGuards, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { StacksService } from './stacks.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('api/endpoints/:endpointId/swarm/stacks')
@UseGuards(JwtAuthGuard)
export class StacksController {
  constructor(private readonly stacksService: StacksService) {}

  @Get()
  list(@Param('endpointId') endpointId: string) {
    return this.stacksService.list(endpointId);
  }

  @Post()
  deploy(
    @Param('endpointId') endpointId: string,
    @Body() body: { name: string; composeContent: string },
  ) {
    return this.stacksService.deploy(body.name, body.composeContent, endpointId);
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
  getCompose(
    @Param('endpointId') endpointId: string,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    const content = this.stacksService.getComposeFile(name);
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  }

  @Delete(':name')
  remove(@Param('endpointId') endpointId: string, @Param('name') name: string) {
    return this.stacksService.remove(name, endpointId);
  }
}

import {
  Controller, Get, Post, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SwarmService } from './swarm.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('api/endpoints/:endpointId/swarm')
@UseGuards(JwtAuthGuard)
export class SwarmController {
  constructor(private readonly swarmService: SwarmService) {}

  @Get()
  inspect(@Param('endpointId') endpointId: string) {
    return this.swarmService.inspect(endpointId);
  }

  @Get('info')
  info(@Param('endpointId') endpointId: string) {
    return this.swarmService.info(endpointId);
  }

  @Post('init')
  @HttpCode(HttpStatus.OK)
  init(
    @Param('endpointId') endpointId: string,
    @Body() body: { advertiseAddr: string; listenAddr?: string },
  ) {
    return this.swarmService.init(body.advertiseAddr, body.listenAddr, endpointId);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  join(
    @Param('endpointId') endpointId: string,
    @Body() body: { remoteAddrs: string[]; joinToken: string; advertiseAddr?: string },
  ) {
    return this.swarmService.join(body.remoteAddrs, body.joinToken, body.advertiseAddr, endpointId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  leave(
    @Param('endpointId') endpointId: string,
    @Body() body: { force?: boolean },
  ) {
    return this.swarmService.leave(body.force, endpointId);
  }
}

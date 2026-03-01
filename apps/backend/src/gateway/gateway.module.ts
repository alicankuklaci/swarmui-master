import { Module } from '@nestjs/common';
import { DockerGateway } from './docker.gateway';
import { DockerModule } from '../docker/docker.module';

@Module({
  imports: [DockerModule],
  providers: [DockerGateway],
})
export class GatewayModule {}

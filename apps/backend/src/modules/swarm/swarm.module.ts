import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SwarmService } from './swarm.service';
import { SwarmController } from './swarm.controller';
import { NodesService } from './nodes/nodes.service';
import { NodesController } from './nodes/nodes.controller';
import { ServicesService } from './services/services.service';
import { ServicesController } from './services/services.controller';
import { StacksService } from './stacks/stacks.service';
import { StacksController } from './stacks/stacks.controller';
import { StackFile, StackFileSchema } from './stacks/stack-file.schema';
import { DockerModule } from '../../docker/docker.module';

@Module({
  imports: [
    DockerModule,
    MongooseModule.forFeature([{ name: StackFile.name, schema: StackFileSchema }]),
  ],
  controllers: [SwarmController, NodesController, ServicesController, StacksController],
  providers: [SwarmService, NodesService, ServicesService, StacksService],
  exports: [SwarmService, NodesService, ServicesService, StacksService],
})
export class SwarmModule {}

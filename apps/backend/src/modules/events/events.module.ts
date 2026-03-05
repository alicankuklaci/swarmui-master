import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DockerModule } from '../../docker/docker.module';

@Module({
  imports: [DockerModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EndpointsService } from './endpoints.service';
import { EndpointsController } from './endpoints.controller';
import { Endpoint, EndpointSchema } from './schemas/endpoint.schema';
import { DockerModule } from '../../docker/docker.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Endpoint.name, schema: EndpointSchema }]),
    DockerModule,
  ],
  controllers: [EndpointsController],
  providers: [EndpointsService],
  exports: [EndpointsService],
})
export class EndpointsModule {}

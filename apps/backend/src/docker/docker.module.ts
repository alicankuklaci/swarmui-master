import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Endpoint, EndpointSchema } from '../modules/endpoints/schemas/endpoint.schema';
import { DockerService } from './docker.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Endpoint.name, schema: EndpointSchema }])],
  providers: [DockerService],
  exports: [DockerService],
})
export class DockerModule {}

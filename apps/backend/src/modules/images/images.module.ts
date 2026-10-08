import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { DockerModule } from '../../docker/docker.module';
import { Registry, RegistrySchema } from '../registries/schemas/registry.schema';

@Module({
  imports: [
    DockerModule,
    MongooseModule.forFeature([{ name: Registry.name, schema: RegistrySchema }]),
  ],
  controllers: [ImagesController],
  providers: [ImagesService],
  exports: [ImagesService],
})
export class ImagesModule {}

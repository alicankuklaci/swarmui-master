import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Registry, RegistrySchema } from './schemas/registry.schema';
import { RegistriesService } from './registries.service';
import { RegistriesController } from './registries.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Registry.name, schema: RegistrySchema }])],
  controllers: [RegistriesController],
  providers: [RegistriesService],
  exports: [RegistriesService],
})
export class RegistriesModule {}

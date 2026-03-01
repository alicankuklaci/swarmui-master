import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from './schemas/template.schema';
import { TemplatesService } from './templates.service';
import { TemplateDeployService } from './template-deploy.service';
import { TemplatesController } from './templates.controller';
import { DockerModule } from '../../docker/docker.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: TemplateSchema }]),
    DockerModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateDeployService],
  exports: [TemplatesService],
})
export class TemplatesModule {}

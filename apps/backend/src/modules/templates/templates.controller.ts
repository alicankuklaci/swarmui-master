import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TemplatesService } from './templates.service';
import { TemplateDeployService } from './template-deploy.service';
import { CreateTemplateDto, UpdateTemplateDto, DeployTemplateDto } from './dto/template.dto';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateDeployService: TemplateDeployService,
  ) {}

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.templatesService.findAll(category, search);
  }

  @Get('categories')
  getCategories() {
    return this.templatesService.getCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Post(':id/deploy')
  deploy(@Param('id') id: string, @Body() dto: DeployTemplateDto) {
    return this.templateDeployService.deploy(id, dto);
  }
}

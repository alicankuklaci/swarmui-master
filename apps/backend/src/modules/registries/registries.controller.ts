import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RegistriesService } from './registries.service';
import { CreateRegistryDto, UpdateRegistryDto } from './dto/registry.dto';

@UseGuards(JwtAuthGuard)
@Controller('registries')
export class RegistriesController {
  constructor(private readonly registriesService: RegistriesService) {}

  @Get()
  findAll() {
    return this.registriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registriesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRegistryDto) {
    return this.registriesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRegistryDto) {
    return this.registriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.registriesService.remove(id);
  }

  @Post(':id/test')
  testAuth(@Param('id') id: string) {
    return this.registriesService.testAuth(id);
  }

  @Get(':id/catalog')
  getCatalog(@Param('id') id: string) {
    return this.registriesService.getCatalog(id);
  }

  @Get(':id/tags/:image(*)')
  getTags(@Param('id') id: string, @Param('image') image: string) {
    return this.registriesService.getTags(id, image);
  }
}

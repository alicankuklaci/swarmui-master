import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EndpointsService } from './endpoints.service';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Endpoints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller({ path: 'endpoints', version: '1' })
export class EndpointsController {
  constructor(private readonly endpointsService: EndpointsService) {}

  @Get()
  @ApiOperation({ summary: 'List all endpoints' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string
  ) {
    return this.endpointsService.findAll(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get endpoint by ID' })
  findOne(@Param('id') id: string) {
    return this.endpointsService.findById(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create endpoint' })
  create(@Body() dto: CreateEndpointDto) {
    return this.endpointsService.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update endpoint' })
  update(@Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.endpointsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete endpoint' })
  delete(@Param('id') id: string) {
    return this.endpointsService.delete(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test endpoint connection' })
  testConnection(@Param('id') id: string) {
    return this.endpointsService.testConnection(id);
  }
}

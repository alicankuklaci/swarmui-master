import { IsString, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Deployment target shape',
    enum: ['container', 'swarm-service', 'stack'],
    example: 'stack',
  })
  @IsEnum(['container', 'swarm-service', 'stack'])
  type: string;

  @ApiProperty({ description: 'Template title shown in the catalogue', example: 'WordPress + MariaDB' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Short description', example: 'Blog platform with persistent MariaDB.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Logo URL (PNG/SVG)', example: 'https://cdn.ex.com/wp.svg' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ description: 'Container-template image reference', example: 'wordpress:latest' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ description: 'docker-compose YAML (for stack type)' })
  @IsOptional()
  @IsString()
  composeContent?: string;

  @ApiPropertyOptional({ description: 'Catalogue categories', type: [String], example: ['CMS', 'Blog'] })
  @IsOptional()
  @IsArray()
  categories?: string[];

  @ApiPropertyOptional({
    description: 'Environment variable schema (name, label, default, select, …)',
    example: [{ name: 'WORDPRESS_DB_PASSWORD', label: 'DB password', default: 'changeme' }],
  })
  @IsOptional()
  @IsArray()
  env?: any[];

  @ApiPropertyOptional({ description: 'Port spec hints', example: [{ host: 8080, container: 80 }] })
  @IsOptional()
  @IsArray()
  ports?: any[];

  @ApiPropertyOptional({ description: 'Volume spec hints', example: [{ bind: '/data/wp', container: '/var/www/html' }] })
  @IsOptional()
  @IsArray()
  volumes?: any[];

  @ApiPropertyOptional({ description: 'Visible to every user', example: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Admin-only note shown on the template detail page' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  composeContent?: string;

  @IsOptional()
  @IsArray()
  categories?: string[];

  @IsOptional()
  @IsArray()
  env?: any[];

  @IsOptional()
  @IsArray()
  ports?: any[];

  @IsOptional()
  @IsArray()
  volumes?: any[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DeployTemplateDto {
  @ApiPropertyOptional({ description: 'Target endpoint id (defaults to the local Swarm endpoint)' })
  @IsOptional()
  @IsString()
  endpointId?: string;

  @ApiPropertyOptional({ description: 'Deployment name (used as stack/service/container name)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Values to substitute into the template env schema',
    example: { WORDPRESS_DB_PASSWORD: 'hunter2' },
  })
  @IsOptional()
  envValues?: Record<string, string>;
}

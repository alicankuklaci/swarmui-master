import { IsString, IsEnum, IsUrl, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRegistryDto {
  @ApiProperty({ description: 'Human-friendly registry name', example: 'DockerHub (prod)' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Registry provider type',
    enum: ['dockerhub', 'gcr', 'ecr', 'acr', 'gitlab', 'quay', 'custom'],
    example: 'dockerhub',
  })
  @IsEnum(['dockerhub', 'gcr', 'ecr', 'acr', 'gitlab', 'quay', 'custom'])
  type: string;

  @ApiProperty({ description: 'Registry URL', example: 'https://index.docker.io/v1/' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'Username for private registries', example: 'alican' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Password or access token (write-only; not returned on GET)' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Whether this registry requires authentication', example: true })
  @IsOptional()
  @IsBoolean()
  authentication?: boolean;

  @ApiPropertyOptional({
    description: 'User IDs (or team IDs) allowed to pull from this registry — empty means everyone',
    type: [String],
    example: ['6512abc...'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessList?: string[];
}

export class UpdateRegistryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsBoolean()
  authentication?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessList?: string[];
}

import { IsString, IsEnum, IsUrl, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class CreateRegistryDto {
  @IsString()
  name: string;

  @IsEnum(['dockerhub', 'gcr', 'ecr', 'acr', 'gitlab', 'quay', 'custom'])
  type: string;

  @IsString()
  url: string;

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

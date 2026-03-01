import { IsString, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreateTemplateDto {
  @IsEnum(['container', 'swarm-service', 'stack'])
  type: string;

  @IsString()
  title: string;

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
  @IsOptional()
  @IsString()
  endpointId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  envValues?: Record<string, string>;
}

import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionDto {
  @ApiProperty()
  @IsString()
  resource: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  actions: string[];
}

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [PermissionDto] })
  @IsArray()
  @IsOptional()
  permissions?: PermissionDto[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [PermissionDto] })
  @IsArray()
  @IsOptional()
  permissions?: PermissionDto[];
}

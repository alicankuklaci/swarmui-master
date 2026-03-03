import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEndpointDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['local', 'tcp', 'tls', 'agent'] })
  @IsEnum(['local', 'tcp', 'tls', 'agent'])
  type: string;

  @ApiProperty({ example: 'unix:///var/run/docker.sock' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  groupId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  agentToken?: string;
}

export class UpdateEndpointDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  groupId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  agentToken?: string;
}

import { IsString, IsOptional, IsArray, IsObject, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContainerDto {
  @ApiProperty({
    description: 'Image reference (name[:tag] or image@digest)',
    example: 'nginx:1.27-alpine',
  })
  @IsString()
  image: string;

  @ApiPropertyOptional({ description: 'Container name (unique per endpoint)', example: 'web-01' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Command to run', type: [String], example: ['nginx', '-g', 'daemon off;'] })
  @IsArray()
  @IsOptional()
  cmd?: string[];

  @ApiPropertyOptional({
    description: 'Environment variables as KEY=VALUE strings',
    type: [String],
    example: ['TZ=UTC', 'LOG_LEVEL=info'],
  })
  @IsArray()
  @IsOptional()
  env?: string[];

  @ApiPropertyOptional({
    description: 'Docker port bindings map (container port/proto -> host bindings)',
    example: { '80/tcp': [{ HostPort: '8080' }] },
  })
  @IsObject()
  @IsOptional()
  portBindings?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Volume mounts as "/host:/container[:ro]" strings',
    type: [String],
    example: ['/data/web:/usr/share/nginx/html:ro'],
  })
  @IsArray()
  @IsOptional()
  volumes?: string[];

  @ApiPropertyOptional({
    description: 'Labels for the container',
    example: { 'com.docker.compose.project': 'web' },
  })
  @IsObject()
  @IsOptional()
  labels?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Network mode (bridge, host, none, or network name)', example: 'bridge' })
  @IsString()
  @IsOptional()
  networkMode?: string;

  @ApiPropertyOptional({ description: 'Remove container when it exits', example: false })
  @IsBoolean()
  @IsOptional()
  autoRemove?: boolean;

  @ApiPropertyOptional({ description: 'Run in privileged mode', example: false })
  @IsBoolean()
  @IsOptional()
  privileged?: boolean;

  @ApiPropertyOptional({
    description: 'Restart policy (no, on-failure, always, unless-stopped)',
    example: 'unless-stopped',
  })
  @IsString()
  @IsOptional()
  restartPolicy?: string;

  @ApiPropertyOptional({ description: 'Memory limit in bytes', example: 536870912 })
  @IsNumber()
  @IsOptional()
  memory?: number;

  @ApiPropertyOptional({ description: 'CPU quota in microseconds per 100ms period', example: 50000 })
  @IsNumber()
  @IsOptional()
  cpuQuota?: number;
}

export class RenameContainerDto {
  @ApiProperty({ description: 'New container name', example: 'web-02' })
  @IsString()
  name: string;
}

export class ContainerLogsDto {
  @IsBoolean()
  @IsOptional()
  stdout?: boolean;

  @IsBoolean()
  @IsOptional()
  stderr?: boolean;

  @IsNumber()
  @IsOptional()
  tail?: number;

  @IsBoolean()
  @IsOptional()
  timestamps?: boolean;
}

export class ContainerExecDto {
  @IsArray()
  cmd: string[];

  @IsBoolean()
  @IsOptional()
  tty?: boolean;
}

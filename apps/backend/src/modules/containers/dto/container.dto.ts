import { IsString, IsOptional, IsArray, IsObject, IsNumber, IsBoolean } from 'class-validator';

export class CreateContainerDto {
  @IsString()
  image: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  cmd?: string[];

  @IsArray()
  @IsOptional()
  env?: string[];

  @IsObject()
  @IsOptional()
  portBindings?: Record<string, any>;

  @IsArray()
  @IsOptional()
  volumes?: string[];

  @IsObject()
  @IsOptional()
  labels?: Record<string, string>;

  @IsString()
  @IsOptional()
  networkMode?: string;

  @IsBoolean()
  @IsOptional()
  autoRemove?: boolean;

  @IsBoolean()
  @IsOptional()
  privileged?: boolean;

  @IsString()
  @IsOptional()
  restartPolicy?: string;

  @IsNumber()
  @IsOptional()
  memory?: number;

  @IsNumber()
  @IsOptional()
  cpuQuota?: number;
}

export class RenameContainerDto {
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

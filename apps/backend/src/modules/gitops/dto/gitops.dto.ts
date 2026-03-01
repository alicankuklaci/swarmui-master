import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class CreateGitopsDeploymentDto {
  @IsString()
  name: string;

  @IsEnum(['stack', 'service'])
  deployType: string;

  @IsString()
  repoUrl: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  composePath?: string;

  @IsOptional()
  @IsString()
  gitCredentialsId?: string;

  @IsOptional()
  @IsString()
  endpointId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1440)
  pollingIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoUpdate?: boolean;
}

export class UpdateGitopsDeploymentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  composePath?: string;

  @IsOptional()
  @IsString()
  gitCredentialsId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1440)
  pollingIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoUpdate?: boolean;
}

export class CreateGitCredentialsDto {
  @IsString()
  name: string;

  @IsEnum(['pat', 'ssh'])
  type: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  sshKey?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

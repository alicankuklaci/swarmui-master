import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBackupDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  includeDatabase?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  includeConfigs?: boolean;

  @ApiProperty({ required: false, enum: ['local', 's3', 'minio'] })
  @IsEnum(['local', 's3', 'minio'])
  @IsOptional()
  storage?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  s3Bucket?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  s3Region?: string;
}

export class CreateScheduledBackupDto extends CreateBackupDto {
  @ApiProperty()
  @IsString()
  cronExpression: string;
}

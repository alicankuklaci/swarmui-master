import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STORAGE_BACKENDS,
  type StorageBackend,
} from '@swarmui-master/storage-plan';

// The shape storage-core accepts to kick off an install. Driver-specific
// options live under driverOpts and are opaque here — each driver re-validates
// its own slice. Deliberately strict: an unknown backend or a bad NFS server
// hostname is caught by class-validator before anything hits the state machine.
export class InstallStorageDto {
  @ApiProperty({ enum: STORAGE_BACKENDS, example: 'seaweedfs' })
  @IsIn(STORAGE_BACKENDS as unknown as string[])
  backend: StorageBackend;

  @ApiProperty({ type: [String], example: ['node02', 'node03'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true })
  nodes: string[];

  @ApiPropertyOptional({ description: 'NFS server node (NFS backend only).' })
  @ValidateIf((o: InstallStorageDto) => o.backend === 'nfs')
  @IsString()
  nfsServerNode?: string;

  @ApiPropertyOptional({
    description: 'SeaweedFS replication string, e.g. 010.',
    example: '010',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{3}$/, { message: 'replication must be a 3-digit string' })
  replication?: string;

  @ApiPropertyOptional({
    description: 'Skip TLS at install. Dev/trusted networks only.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  insecure?: boolean;
}

export class InstallSessionResponseDto {
  @ApiProperty({ description: 'Opaque session id for the install run.' })
  installSessionId: string;
}

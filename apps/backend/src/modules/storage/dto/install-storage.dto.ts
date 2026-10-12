import {
  ArrayMinSize,
  ArrayNotEmpty,
  ArrayMaxSize,
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

// Hostname pattern: RFC 1123 label (letters/digits/hyphen, no leading hyphen),
// extended with dots for FQDNs. Deliberately strict — these values flow into
// the AGENT_WS_URL_TEMPLATE substitution and the openssl -subj CN of the per-
// node certs; a bad entry could redirect the WS connection off-swarm or smuggle
// a shell meta-char through openssl. 1-253 chars matches DNS limits.
export const NODE_NAME_RE = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

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
  @ArrayMaxSize(64)
  // C pack #5: strict hostname regex on every entry. Without this a POST
  // like {"nodes": ["node02; curl evil"]} or {"nodes":
  // ["evil.attacker.net"]} would substitute straight into the agent WS URL
  // template and redirect the connection off-swarm; the ADOPTING handshake
  // runs over HMAC so the attacker can't forge frames, but a plain DNS
  // takeover is enough to steal install args (which carry no secrets today
  // but will carry TLS material in Sprint 8).
  @IsString({ each: true })
  @Matches(NODE_NAME_RE, {
    each: true,
    message: 'nodes[$value] is not a valid hostname (RFC 1123)',
  })
  nodes: string[];

  @ApiPropertyOptional({ description: 'NFS server node (NFS backend only).' })
  @ValidateIf((o: InstallStorageDto) => o.backend === 'nfs')
  @IsString()
  @Matches(NODE_NAME_RE, {
    message: 'nfsServerNode is not a valid hostname (RFC 1123)',
  })
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

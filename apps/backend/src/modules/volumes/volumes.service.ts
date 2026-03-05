import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class VolumesService {
  private readonly logger = new Logger(VolumesService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listVolumes();
  }

  async inspect(name: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const volume = docker.getVolume(name);
    try {
      return await volume.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Volume ${name} not found`);
    }
  }

  async create(
    name: string,
    driver = 'local',
    driverOpts: Record<string, string> = {},
    labels: Record<string, string> = {},
    endpointId?: string,
  ) {
    const docker = this.getDocker(endpointId);
    const volume = await docker.createVolume({
      Name: name,
      Driver: driver,
      DriverOpts: driverOpts,
      Labels: labels,
    });
    return volume;
  }

  async remove(name: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const volume = docker.getVolume(name);
    try {
      await volume.remove({ force });
      return { message: 'Volume removed' };
    } catch (err: any) {
      throw new NotFoundException(`Volume ${name} not found`);
    }
  }

  async prune(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.pruneVolumes();
  }

  async browse(name: string, browsePath = '/', endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const safePath = browsePath.replace(/\.\./g, '').replace(/[;&|`$]/g, '');
    const dataPath = `/data${safePath.startsWith('/') ? safePath : '/' + safePath}`;

    let container: any;
    try {
      // Pull alpine if not present
      try {
        await docker.getImage('alpine:latest').inspect();
      } catch {
        await new Promise<void>((res, rej) => docker.pull('alpine:latest', (err: any, stream: any) => {
          if (err) return rej(err);
          docker.modem.followProgress(stream, (e: any) => e ? rej(e) : res());
        }));
      }
      container = await docker.createContainer({
        Image: 'alpine',
        Cmd: ['ls', '-la', dataPath],
        HostConfig: { Binds: [`${name}:/data:ro`], AutoRemove: true },
      });
      await container.start();
      const logs = await new Promise<string>((resolve, reject) => {
        (container.logs as any)(
          { stdout: true, stderr: true, follow: true },
          (err: any, stream: any) => {
            if (err) return reject(err);
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            stream.on('error', reject);
          },
        );
      });

      // Wait for container to finish
      try { await container.wait(); } catch (_) {}

      const lines = logs.split('\n').filter((l) => l.trim());
      const files = lines.slice(1).map((line) => {
        // Strip Docker log header (8 bytes) if present
        let clean = line;
        if (clean.charCodeAt(0) <= 2 && clean.length > 8) {
          clean = clean.substring(8);
        }
        // Remove non-printable characters
        clean = clean.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
        const parts = clean.split(/\s+/);
        if (parts.length < 9) return null;
        const perms = parts[0];
        const size = parseInt(parts[4]) || 0;
        const date = `${parts[5]} ${parts[6]} ${parts[7]}`;
        const fileName = parts.slice(8).join(' ');
        if (fileName === '.' || fileName === '..') return null;
        return {
          name: fileName,
          type: perms.startsWith('d') ? 'dir' : 'file',
          size,
          date,
          permissions: perms,
        };
      }).filter(Boolean);

      return files;
    } catch (err: any) {
      this.logger.error(`Volume browse error: ${err.message}`);
      throw new NotFoundException(`Cannot browse volume ${name}: ${err.message}`);
    }
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';
import { CreateContainerDto, RenameContainerDto } from './dto/container.dto';

@Injectable()
export class ContainersService {
  private readonly logger = new Logger(ContainersService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return endpointId
      ? this.dockerService.getLocalConnection()
      : this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string, all = true) {
    const docker = this.getDocker(endpointId);
    const containers = await docker.listContainers({ all });
    return containers;
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    try {
      return await container.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Container ${id} not found`);
    }
  }

  async create(dto: CreateContainerDto, endpointId?: string) {
    const docker = this.getDocker(endpointId);

    const createOptions: Dockerode.ContainerCreateOptions = {
      Image: dto.image,
      name: dto.name,
      Cmd: dto.cmd,
      Env: dto.env,
      Labels: dto.labels,
      HostConfig: {
        PortBindings: dto.portBindings || {},
        Binds: dto.volumes || [],
        NetworkMode: dto.networkMode,
        AutoRemove: dto.autoRemove || false,
        Privileged: dto.privileged || false,
        RestartPolicy: dto.restartPolicy ? { Name: dto.restartPolicy } : undefined,
        Memory: dto.memory,
        CpuQuota: dto.cpuQuota,
      },
    };

    const container = await docker.createContainer(createOptions);
    return container.inspect();
  }

  async start(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.start();
    return { message: 'Container started' };
  }

  async stop(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.stop();
    return { message: 'Container stopped' };
  }

  async restart(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.restart();
    return { message: 'Container restarted' };
  }

  async kill(id: string, signal = 'SIGKILL', endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.kill({ signal });
    return { message: 'Container killed' };
  }

  async pause(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.pause();
    return { message: 'Container paused' };
  }

  async unpause(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.unpause();
    return { message: 'Container unpaused' };
  }

  async rename(id: string, dto: RenameContainerDto, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.rename({ name: dto.name });
    return { message: 'Container renamed' };
  }

  async remove(id: string, force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    await container.remove({ force });
    return { message: 'Container removed' };
  }

  async prune(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const result = await docker.pruneContainers();
    return result;
  }

  getLogs(id: string, tail = 100, follow = false, endpointId?: string): Observable<MessageEvent> {
    const docker = this.getDocker(endpointId);
    const subject = new Subject<MessageEvent>();

    (docker.getContainer(id).logs as any)({
      follow,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    }, (err: any, stream: any) => {
      if (err) {
        subject.error(err);
        return;
      }
      if (!stream) {
        subject.complete();
        return;
      }

      (docker.modem as any).demuxStream(stream,
        { write: (chunk: Buffer) => { const text = chunk.toString('utf8'); subject.next({ data: { type: 'stdout', text } } as MessageEvent); } },
        { write: (chunk: Buffer) => { const text = chunk.toString('utf8'); subject.next({ data: { type: 'stderr', text } } as MessageEvent); } },
      );

      stream.on('end', () => subject.complete());
      stream.on('error', (e: any) => subject.error(e));
    });

    return subject.asObservable();
  }

  getStats(id: string, endpointId?: string): Observable<MessageEvent> {
    const docker = this.getDocker(endpointId);
    const subject = new Subject<MessageEvent>();

    docker.getContainer(id).stats({ stream: true }, (err: any, stream: any) => {
      if (err) {
        subject.error(err);
        return;
      }
      if (!stream) {
        subject.complete();
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        try {
          const raw = JSON.parse(chunk.toString());
          const stats = this.parseStats(raw);
          subject.next({ data: stats } as MessageEvent);
        } catch (_) {}
      });
      stream.on('end', () => subject.complete());
      stream.on('error', (e: any) => subject.error(e));
    });

    return subject.asObservable();
  }

  private parseStats(raw: any) {
    const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
    const numCpus = raw.cpu_stats.online_cpus || raw.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100.0 : 0;

    const memUsage = raw.memory_stats.usage || 0;
    const memLimit = raw.memory_stats.limit || 1;
    const memPercent = (memUsage / memLimit) * 100;

    const networks = raw.networks || {};
    let rxBytes = 0, txBytes = 0;
    for (const iface of Object.values(networks) as any[]) {
      rxBytes += iface.rx_bytes || 0;
      txBytes += iface.tx_bytes || 0;
    }

    const blkRead = (raw.blkio_stats?.io_service_bytes_recursive || [])
      .filter((b: any) => b.op === 'Read').reduce((a: number, b: any) => a + b.value, 0);
    const blkWrite = (raw.blkio_stats?.io_service_bytes_recursive || [])
      .filter((b: any) => b.op === 'Write').reduce((a: number, b: any) => a + b.value, 0);

    return {
      timestamp: raw.read,
      cpu: { percent: parseFloat(cpuPercent.toFixed(2)) },
      memory: { usage: memUsage, limit: memLimit, percent: parseFloat(memPercent.toFixed(2)) },
      network: { rxBytes, txBytes },
      block: { read: blkRead, write: blkWrite },
      pids: raw.pids_stats?.current || 0,
    };
  }
}

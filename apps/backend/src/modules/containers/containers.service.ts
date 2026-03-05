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
    return this.dockerService.getLocalConnection();
  }

  /** Get a Dockerode instance connected via the swarm-agent on the given node IP */
  private getDockerForNode(nodeIp: string): Dockerode {
    const AGENT_TOKEN = process.env.AGENT_TOKEN || 'supersecret';
    const AGENT_PORT = process.env.AGENT_PORT || '9001';
    const cacheKey = `node-agent-${nodeIp}`;
    const existing = (this.dockerService as any).connections?.get(cacheKey);
    if (existing) return existing;
    const docker = new Dockerode({
      host: nodeIp,
      port: parseInt(AGENT_PORT),
      protocol: 'http' as any,
      headers: { Authorization: `Bearer ${AGENT_TOKEN}` },
    });
    (this.dockerService as any).connections?.set(cacheKey, docker);
    return docker;
  }

  /** Find which node a container/task is running on and return its IP */
  private async getNodeIpForContainer(containerId: string): Promise<string | null> {
    try {
      const docker = this.dockerService.getLocalConnection();
      const tasks = await docker.listTasks({});
      const task = tasks.find((t: any) =>
        t.Status?.ContainerStatus?.ContainerID === containerId ||
        t.Status?.ContainerStatus?.ContainerID?.startsWith(containerId) ||
        containerId.startsWith(t.Status?.ContainerStatus?.ContainerID || '__')
      );
      if (!task) return null;
      const nodes = await docker.listNodes({});
      const node = nodes.find((n: any) => n.ID === task.NodeID);
      return node?.Status?.Addr || null;
    } catch {
      return null;
    }
  }

  async list(endpointId?: string, all = true) {
    const docker = this.getDocker(endpointId);
    const containers = await docker.listContainers({ all });

    // Also include swarm tasks (containers running on other nodes)
    let swarmTasks: any[] = [];
    try {
      const tasks = await docker.listTasks({ filters: JSON.stringify({ 'desired-state': ['running'] }) });
      const localIds = new Set(containers.map((c: any) => c.Id));
      swarmTasks = tasks
        .filter((t: any) => t.Status?.State === 'running' && !localIds.has(t.Status?.ContainerStatus?.ContainerID))
        .map((t: any) => ({
          Id: t.Status?.ContainerStatus?.ContainerID || t.ID,
          Names: [`/${t.Spec?.ContainerSpec?.Labels?.['com.docker.swarm.service.name'] || t.ServiceID?.slice(0, 12)}.${t.Slot || 1}`],
          Image: t.Spec?.ContainerSpec?.Image || '',
          State: t.Status?.State || 'running',
          Status: `${t.Status?.State} (${t.NodeID?.slice(0, 12)})`,
          Labels: t.Spec?.ContainerSpec?.Labels || {},
          Ports: [],
          Created: t.CreatedAt ? Math.floor(new Date(t.CreatedAt).getTime() / 1000) : 0,
          _swarmTask: true,
          _nodeId: t.NodeID,
          _serviceName: t.Spec?.ContainerSpec?.Labels?.['com.docker.swarm.service.name'] || '',
        }));
    } catch (_) {
      // Not a swarm manager or tasks unavailable
    }

    return [...containers, ...swarmTasks];
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    try {
      return await container.inspect();
    } catch (err: any) {
      // Container might be on another swarm node - try to find it via tasks
      try {
        const tasks = await docker.listTasks({});
        const task = tasks.find((t: any) =>
          t.Status?.ContainerStatus?.ContainerID === id ||
          t.ID === id ||
          t.Status?.ContainerStatus?.ContainerID?.startsWith(id) ||
          id.startsWith(t.Status?.ContainerStatus?.ContainerID || '__')
        );
        if (task) {
          // Return task info formatted like container inspect
          return {
            Id: task.Status?.ContainerStatus?.ContainerID || task.ID,
            Name: `/${task.Spec?.ContainerSpec?.Labels?.['com.docker.swarm.service.name'] || task.ServiceID?.slice(0,12)}.${task.Slot || 1}`,
            Image: task.Spec?.ContainerSpec?.Image || '',
            State: { Status: task.Status?.State || 'running', Running: task.Status?.State === 'running', Pid: 0 },
            Config: {
              Image: task.Spec?.ContainerSpec?.Image || '',
              Labels: task.Spec?.ContainerSpec?.Labels || {},
              Env: task.Spec?.ContainerSpec?.Env || [],
            },
            NetworkSettings: { Networks: {}, Ports: {} },
            HostConfig: { NetworkMode: 'overlay' },
            Mounts: [],
            Created: task.CreatedAt || new Date().toISOString(),
            _swarmTask: true,
            _nodeId: task.NodeID,
            _serviceName: task.Spec?.ContainerSpec?.Labels?.['com.docker.swarm.service.name'] || '',
            _serviceId: task.ServiceID,
          };
        }
      } catch (_) {}
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

      // Strip Docker binary header (8 bytes: stream-type, 0, 0, 0, size[4])
      const stripHeader = (chunk: Buffer): string => {
        let offset = 0;
        const parts: string[] = [];
        while (offset < chunk.length) {
          if (offset + 8 > chunk.length) { parts.push(chunk.slice(offset).toString('utf8')); break; }
          const size = chunk.readUInt32BE(offset + 4);
          if (size === 0) { offset += 8; continue; }
          if (offset + 8 + size > chunk.length) { parts.push(chunk.slice(offset).toString('utf8')); break; }
          parts.push(chunk.slice(offset + 8, offset + 8 + size).toString('utf8'));
          offset += 8 + size;
        }
        return parts.join('');
      };

      stream.on('data', (chunk: Buffer) => {
        const text = stripHeader(chunk);
        if (text) subject.next({ data: { type: 'stdout', text } } as MessageEvent);
      });
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
  async getStatsSingle(id: string, endpointId?: string): Promise<any> {
    const docker = this.getDocker(endpointId);
    return new Promise((resolve, reject) => {
      docker.getContainer(id).stats({ stream: false }, (err: any, data: any) => {
        if (err) return reject(err);
        if (!data) return resolve({});
        const chunks: Buffer[] = [];
        if (typeof data.pipe === 'function') {
          data.on('data', (c: Buffer) => chunks.push(c));
          data.on('end', () => {
            try { resolve(this.parseStats(JSON.parse(Buffer.concat(chunks).toString()))); } catch { resolve({}); }
          });
          data.on('error', reject);
        } else {
          try { resolve(this.parseStats(data)); } catch { resolve({}); }
        }
      });
    });
  }

  async getLogsString(id: string, tail = 100, endpointId?: string): Promise<string> {
    const docker = this.getDocker(endpointId);
    return new Promise((resolve, reject) => {
      (docker.getContainer(id).logs as any)(
        { stdout: true, stderr: true, tail, timestamps: true },
        (err: any, stream: any) => {
          if (err) return reject(err);
          if (!stream) return resolve('');
          const chunks: string[] = [];
          const strip = (chunk: Buffer) => {
            let offset = 0;
            const parts: string[] = [];
            while (offset < chunk.length) {
              if (offset + 8 > chunk.length) break;
              const size = chunk.readUInt32BE(offset + 4);
              if (offset + 8 + size > chunk.length) break;
              parts.push(chunk.slice(offset + 8, offset + 8 + size).toString('utf8'));
              offset += 8 + size;
            }
            return parts.length > 0 ? parts.join('') : chunk.toString('utf8');
          };
          if (typeof stream.pipe === 'function') {
            const bufs: Buffer[] = [];
            stream.on('data', (c: Buffer) => bufs.push(c));
            stream.on('end', () => resolve(strip(Buffer.concat(bufs))));
            stream.on('error', reject);
          } else {
            resolve(typeof stream === 'string' ? stream : '');
          }
        },
      );
    });
  }



  async updateResources(id: string, memory?: number, cpuQuota?: number, cpuShares?: number, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    const updateOpts: any = {};
    if (memory !== undefined) updateOpts.Memory = memory;
    if (cpuQuota !== undefined) updateOpts.CpuQuota = cpuQuota;
    if (cpuShares !== undefined) updateOpts.CpuShares = cpuShares;
    await container.update(updateOpts);
    return { message: 'Container resources updated' };
  }

  async duplicate(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const container = docker.getContainer(id);
    const info = await container.inspect();

    const originalName = (info.Name || '').replace(/^\//, '');
    const newName = `${originalName}-copy-${Date.now().toString(36)}`;

    const createOptions: Dockerode.ContainerCreateOptions = {
      Image: info.Config.Image,
      name: newName,
      Cmd: info.Config.Cmd || undefined,
      Env: info.Config.Env || [],
      Labels: info.Config.Labels || {},
      HostConfig: {
        Binds: info.HostConfig?.Binds || [],
        NetworkMode: info.HostConfig?.NetworkMode || 'bridge',
        RestartPolicy: info.HostConfig?.RestartPolicy || undefined,
        Memory: info.HostConfig?.Memory || 0,
        CpuQuota: info.HostConfig?.CpuQuota || 0,
        CpuShares: info.HostConfig?.CpuShares || 0,
      },
    };

    const newContainer = await docker.createContainer(createOptions);
    return newContainer.inspect();
  }

  /** Returns node IP and agent URL for a container (for frontend direct connection) */
  async getNodeInfo(containerId: string): Promise<{ nodeIp: string | null; agentUrl: string | null; nodeId: string | null }> {
    const nodeIp = await this.getNodeIpForContainer(containerId);
    const AGENT_PORT = process.env.AGENT_PORT || '9001';
    return {
      nodeIp,
      nodeId: null,
      agentUrl: nodeIp ? `http://${nodeIp}:${AGENT_PORT}` : null,
    };
  }
}
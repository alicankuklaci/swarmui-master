import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Dockerode from 'dockerode';
import { DockerService } from '../../../docker/docker.service';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async list(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return (docker as any).listServices({ status: true }) as Promise<any[]>;
  }

  async inspect(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    try {
      return await service.inspect();
    } catch (err: any) {
      throw new NotFoundException(`Service ${id} not found`);
    }
  }

  async create(spec: any, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = await docker.createService(spec);
    return service;
  }

  async update(id: string, spec: any, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    const current = await service.inspect();
    await service.update({ version: current.Version.Index, ...spec });
    return service.inspect();
  }

  async scale(id: string, replicas: number, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    const current = await service.inspect();
    const spec = { ...current.Spec };
    if (spec.Mode?.Replicated) {
      spec.Mode.Replicated.Replicas = replicas;
    }
    await service.update({ version: current.Version.Index, ...spec });
    return service.inspect();
  }

  async forceUpdate(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    const current = await service.inspect();
    const spec = { ...current.Spec };
    spec.TaskTemplate = spec.TaskTemplate || {};
    spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate || 0) + 1;
    await service.update({ version: current.Version.Index, ...spec });
    return service.inspect();
  }

  async rollback(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    const current = await service.inspect();
    // Trigger rollback by setting rollback config
    await service.update({ version: current.Version.Index, rollback: 'previous' } as any);
    return service.inspect();
  }

  async updatePolicy(
    id: string,
    parallelism?: number,
    delay?: number,
    failureAction?: string,
    order?: string,
    endpointId?: string,
  ) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    const current = await service.inspect();
    const spec = { ...current.Spec };
    spec.UpdateConfig = spec.UpdateConfig || {};
    if (parallelism !== undefined) spec.UpdateConfig.Parallelism = parallelism;
    if (delay !== undefined) spec.UpdateConfig.Delay = delay * 1000000000; // seconds to nanoseconds
    if (failureAction) spec.UpdateConfig.FailureAction = failureAction;
    if (order) spec.UpdateConfig.Order = order;
    await service.update({ version: current.Version.Index, ...spec });
    return service.inspect();
  }

  async remove(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const service = docker.getService(id);
    await service.remove();
    return { message: 'Service removed' };
  }

  async tasks(id: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listTasks({ filters: JSON.stringify({ service: [id] }) });
  }

  getLogs(id: string, tail = 100, follow = false, endpointId?: string): Observable<MessageEvent> {
    const docker = this.getDocker(endpointId);
    const subject = new Subject<MessageEvent>();

    docker.getService(id).logs({
      follow,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    } as any, (err: any, stream: any) => {
      if (err) {
        subject.error(err);
        return;
      }
      if (!stream) {
        subject.complete();
        return;
      }

      (docker.modem as any).demuxStream(stream,
        { write: (chunk: Buffer) => { subject.next({ data: { type: 'stdout', text: chunk.toString('utf8') } } as MessageEvent); } },
        { write: (chunk: Buffer) => { subject.next({ data: { type: 'stderr', text: chunk.toString('utf8') } } as MessageEvent); } },
      );

      stream.on('end', () => subject.complete());
      stream.on('error', (e: any) => subject.error(e));
    });

    return subject.asObservable();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import Dockerode from 'dockerode';
import { DockerService } from '../../docker/docker.service';

@Injectable()
export class SwarmService {
  private readonly logger = new Logger(SwarmService.name);

  constructor(private readonly dockerService: DockerService) {}

  private getDocker(endpointId?: string): Dockerode {
    return this.dockerService.getLocalConnection();
  }

  async inspect(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.swarmInspect();
  }

  async init(advertiseAddr: string, listenAddr = '0.0.0.0:2377', endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.swarmInit({ AdvertiseAddr: advertiseAddr, ListenAddr: listenAddr });
  }

  async join(remoteAddrs: string[], joinToken: string, advertiseAddr?: string, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.swarmJoin({
      RemoteAddrs: remoteAddrs,
      JoinToken: joinToken,
      AdvertiseAddr: advertiseAddr,
    });
  }

  async leave(force = false, endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.swarmLeave({ force });
  }

  async listTasks(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    return docker.listTasks({});
  }

  async info(endpointId?: string) {
    const docker = this.getDocker(endpointId);
    const info = await docker.info();
    return {
      nodeId: info.Swarm?.NodeID,
      nodeAddr: info.Swarm?.NodeAddr,
      localNodeState: info.Swarm?.LocalNodeState,
      managers: info.Swarm?.Managers,
      nodes: info.Swarm?.Nodes,
      controlAvailable: info.Swarm?.ControlAvailable,
      remoteManagers: info.Swarm?.RemoteManagers,
    };
  }
}

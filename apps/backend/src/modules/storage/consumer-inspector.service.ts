import { Injectable, Logger } from '@nestjs/common';
import { DockerService } from '../../docker/docker.service';

// Enumerates swarm services that bind-mount a given host path (or a child of
// that path). "Consumer" of the shared mount = any swarm service whose spec
// has a `Mounts[*]` entry of Type 'bind' with Source == mountPoint or a
// descendant.
//
// Why only Type=bind: SeaweedFS v1 lands the mount at a fixed host path
// (/var/lib/swarmui/shared on every node), and the point of this check is
// "would uninstalling break anyone?" — a service that doesn't bind-mount
// that path is unaffected by uninstall. Named volumes, tmpfs mounts, and
// configs don't need to be enumerated here.
//
// We use the local dockerode connection — the SwarmUI backend already runs
// on the swarm manager, so `listServices()` sees the whole cluster's
// service list from this one place. No per-node fan-out required.

export interface InspectedService {
  id: string;
  name: string;
  // The specific mount that matched, for diagnostics. If a service has
  // multiple bind mounts under the shared path, we return the first one
  // we see — the list is "which services need to be stopped", not "which
  // files would be lost".
  matchedSource: string;
}

@Injectable()
export class ConsumerInspectorService {
  private readonly logger = new Logger(ConsumerInspectorService.name);

  constructor(private readonly dockerService: DockerService) {}

  async enumerateConsumers(mountPoint: string): Promise<string[]> {
    const detailed = await this.enumerateDetailed(mountPoint);
    return detailed.map((s) => s.name);
  }

  async enumerateDetailed(mountPoint: string): Promise<InspectedService[]> {
    const normalized = normalizePath(mountPoint);
    const docker = this.dockerService.getLocalConnection();
    // dockerode's TS types don't carry listServices; cast matches the shape
    // the rest of the backend uses.
    const services = (await (docker as unknown as {
      listServices(): Promise<unknown[]>;
    }).listServices()) as DockerServiceSummary[];

    const consumers: InspectedService[] = [];
    for (const svc of services) {
      const match = findMatchingMount(svc, normalized);
      if (!match) continue;
      consumers.push({
        id: svc.ID ?? '',
        name: svc.Spec?.Name ?? svc.ID ?? '<unnamed>',
        matchedSource: match,
      });
    }
    this.logger.debug(
      `enumerateConsumers(${mountPoint}) → ${consumers.length} match(es)`,
    );
    return consumers;
  }
}

// --- shape types + path helpers (not exported from the module) --------

interface DockerMountSpec {
  Type?: string;
  Source?: string;
  Target?: string;
}

interface DockerServiceSummary {
  ID?: string;
  Spec?: {
    Name?: string;
    TaskTemplate?: {
      ContainerSpec?: {
        Mounts?: DockerMountSpec[];
      };
    };
  };
}

// Trailing slashes + duplicate separators normalize to one shape so
// "/var/lib/swarmui/shared", "/var/lib/swarmui/shared/", and
// "/var//lib/swarmui//shared" all compare equal.
export function normalizePath(p: string): string {
  if (typeof p !== 'string' || p.length === 0) return '';
  const collapsed = p.replace(/\/+/g, '/');
  return collapsed.length > 1 && collapsed.endsWith('/')
    ? collapsed.slice(0, -1)
    : collapsed;
}

// Is `source` the same path as `mountPoint`, or a descendant of it? Returns
// false for a sibling path that happens to share a prefix string (`/var/lib`
// is not a parent of `/var/library`).
export function isPathEqualOrDescendant(
  source: string,
  mountPoint: string,
): boolean {
  const s = normalizePath(source);
  const m = normalizePath(mountPoint);
  if (!s || !m) return false;
  if (s === m) return true;
  return s.startsWith(`${m}/`);
}

function findMatchingMount(
  svc: DockerServiceSummary,
  normalizedMountPoint: string,
): string | undefined {
  const mounts = svc.Spec?.TaskTemplate?.ContainerSpec?.Mounts;
  if (!Array.isArray(mounts)) return undefined;
  for (const m of mounts) {
    if (m.Type !== 'bind') continue;
    const source = typeof m.Source === 'string' ? m.Source : '';
    if (isPathEqualOrDescendant(source, normalizedMountPoint)) {
      return source;
    }
  }
  return undefined;
}

import {
  ConsumerInspectorService,
  isPathEqualOrDescendant,
  normalizePath,
} from './consumer-inspector.service';

// Covers both the path-matching helpers (pure functions) and the service
// end-to-end against a mocked DockerService. The service's only
// collaborator is dockerode's listServices(), so the mock surface stays
// tiny.

const MOUNT = '/var/lib/swarmui/shared';

function makeDocker(services: unknown[]) {
  const listServices = jest.fn().mockResolvedValue(services);
  return {
    service: {
      getLocalConnection: () => ({ listServices }),
    } as unknown as import('../../docker/docker.service').DockerService,
    listServices,
  };
}

function svc(name: string, mounts: unknown[]) {
  return {
    ID: `id-${name}`,
    Spec: {
      Name: name,
      TaskTemplate: {
        ContainerSpec: { Mounts: mounts },
      },
    },
  };
}

describe('normalizePath', () => {
  it('collapses runs of slashes and strips a single trailing slash', () => {
    expect(normalizePath('/var/lib/swarmui/shared')).toBe('/var/lib/swarmui/shared');
    expect(normalizePath('/var/lib/swarmui/shared/')).toBe('/var/lib/swarmui/shared');
    expect(normalizePath('/var//lib///swarmui/shared')).toBe('/var/lib/swarmui/shared');
    // Root stays as-is (never strip to empty).
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('');
  });
});

describe('isPathEqualOrDescendant', () => {
  it('matches identical paths after normalization', () => {
    expect(isPathEqualOrDescendant('/var/lib/swarmui/shared', MOUNT)).toBe(true);
    expect(isPathEqualOrDescendant('/var/lib/swarmui/shared/', MOUNT)).toBe(true);
  });
  it('matches a descendant', () => {
    expect(isPathEqualOrDescendant('/var/lib/swarmui/shared/sub/dir', MOUNT)).toBe(
      true,
    );
  });
  it('refuses a sibling that only shares the prefix string', () => {
    // Classic prefix-collision: /var/lib/swarmui/shared vs /var/lib/swarmui/shared-backup
    expect(
      isPathEqualOrDescendant('/var/lib/swarmui/shared-backup', MOUNT),
    ).toBe(false);
    expect(isPathEqualOrDescendant('/var/lib/swarmui/sharedx', MOUNT)).toBe(false);
  });
  it('refuses an unrelated path', () => {
    expect(isPathEqualOrDescendant('/opt/foo', MOUNT)).toBe(false);
  });
  it('rejects an empty source', () => {
    expect(isPathEqualOrDescendant('', MOUNT)).toBe(false);
  });
});

describe('ConsumerInspectorService.enumerateConsumers', () => {
  it('returns [] when no service bind-mounts the path', async () => {
    const { service } = makeDocker([
      svc('web', [{ Type: 'volume', Source: 'web-data', Target: '/data' }]),
    ]);
    const result = await new ConsumerInspectorService(service).enumerateConsumers(
      MOUNT,
    );
    expect(result).toEqual([]);
  });

  it('returns the service name for an exact bind match', async () => {
    const { service } = makeDocker([
      svc('ingest', [{ Type: 'bind', Source: MOUNT, Target: '/data' }]),
    ]);
    const result = await new ConsumerInspectorService(service).enumerateConsumers(
      MOUNT,
    );
    expect(result).toEqual(['ingest']);
  });

  it('matches a descendant bind source', async () => {
    const { service } = makeDocker([
      svc('render', [
        { Type: 'bind', Source: `${MOUNT}/renders`, Target: '/out' },
      ]),
    ]);
    const result = await new ConsumerInspectorService(service).enumerateConsumers(
      MOUNT,
    );
    expect(result).toEqual(['render']);
  });

  it('ignores non-bind mounts even if the source looks like the mountpoint', async () => {
    const { service } = makeDocker([
      // Named volume whose literal name happens to match the mountpoint;
      // must not be treated as a consumer.
      svc('odd', [{ Type: 'volume', Source: MOUNT, Target: '/data' }]),
    ]);
    expect(
      await new ConsumerInspectorService(service).enumerateConsumers(MOUNT),
    ).toEqual([]);
  });

  it('rejects a sibling path that shares the prefix string', async () => {
    const { service } = makeDocker([
      svc('backup', [
        { Type: 'bind', Source: `${MOUNT}-backup/data`, Target: '/data' },
      ]),
    ]);
    expect(
      await new ConsumerInspectorService(service).enumerateConsumers(MOUNT),
    ).toEqual([]);
  });

  it('tolerates a service with no Mounts section without throwing', async () => {
    const { service } = makeDocker([
      {
        ID: 'id-x',
        Spec: { Name: 'x', TaskTemplate: { ContainerSpec: {} } },
      },
    ]);
    expect(
      await new ConsumerInspectorService(service).enumerateConsumers(MOUNT),
    ).toEqual([]);
  });

  it('returns one entry per matching service and dedupes across multiple matching mounts in one spec', async () => {
    const { service } = makeDocker([
      svc('ingest', [
        { Type: 'bind', Source: MOUNT, Target: '/in' },
        { Type: 'bind', Source: `${MOUNT}/stage`, Target: '/stage' },
      ]),
      svc('render', [
        { Type: 'bind', Source: `${MOUNT}/out`, Target: '/out' },
      ]),
    ]);
    const result = await new ConsumerInspectorService(service).enumerateConsumers(
      MOUNT,
    );
    // ingest matches multiple mounts but is only listed once.
    expect(result).toEqual(['ingest', 'render']);
  });

  it('enumerateDetailed carries the matched source for diagnostics', async () => {
    const { service } = makeDocker([
      svc('render', [{ Type: 'bind', Source: `${MOUNT}/out`, Target: '/out' }]),
    ]);
    const detailed = await new ConsumerInspectorService(service).enumerateDetailed(
      MOUNT,
    );
    expect(detailed).toHaveLength(1);
    expect(detailed[0].name).toBe('render');
    expect(detailed[0].matchedSource).toBe(`${MOUNT}/out`);
  });
});

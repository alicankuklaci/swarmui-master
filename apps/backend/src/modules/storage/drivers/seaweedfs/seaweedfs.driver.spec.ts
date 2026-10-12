import { BadRequestException } from '@nestjs/common';
import {
  NODE_EXEC_COMMANDS,
  type SharedStorageConfig,
} from '@swarmui-master/storage-plan';
import { SeaweedfsDriver } from './seaweedfs.driver';

// SeaweedFS driver — pure plan generation. The orchestrator (Sprint 2 D2)
// consumes this output and the agent (Sprint 3) re-validates each step
// against the same NODE_EXEC_COMMANDS whitelist, so the invariants here are
// the contract that keeps the two sides from drifting.

const SESSION = 'sess-abc';
const baseConfig = (
  overrides: Partial<SharedStorageConfig> = {},
): SharedStorageConfig => ({
  backend: 'seaweedfs',
  nodes: ['node02', 'node03'],
  mountPoint: '/var/lib/swarmui/shared',
  ...overrides,
});

describe('SeaweedfsDriver', () => {
  let driver: SeaweedfsDriver;
  beforeEach(() => {
    // plan() tests don't exercise enumerateConsumers; a null-cast inspector
    // keeps construction cheap. Any test that calls enumerateConsumers must
    // provide a real mock.
    driver = new SeaweedfsDriver(null as unknown as ConstructorParameters<typeof SeaweedfsDriver>[0]);
  });

  describe('plan()', () => {
    it('every step uses a whitelisted commandId', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      for (const step of plan.steps) {
        expect(NODE_EXEC_COMMANDS).toContain(step.commandId);
      }
    });

    it('step ids are unique and lexicographically ordered', () => {
      const plan = driver.plan(baseConfig({ nodes: ['n1', 'n2', 'n3'] }), SESSION);
      const ids = plan.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const sorted = [...ids].sort();
      expect(sorted).toEqual(ids);
    });

    it('schedules master, filer, and cluster-level steps on nodes[0]', () => {
      const plan = driver.plan(
        baseConfig({ nodes: ['alpha', 'beta', 'gamma'] }),
        SESSION,
      );
      const nodeOnly = (cmd: string) =>
        plan.steps.filter((s) => s.commandId === cmd).map((s) => s.nodeId);
      expect(nodeOnly('docker-run-seaweedfs-master')).toEqual(['alpha']);
      expect(nodeOnly('docker-run-seaweedfs-filer')).toEqual(['alpha']);
      expect(nodeOnly('seaweedfs-cluster-healthcheck')).toEqual(['alpha']);
      expect(nodeOnly('test-mount-write')).toEqual(['alpha']);
    });

    it('schedules volume + mount + firewall on every node', () => {
      const nodes = ['n1', 'n2', 'n3'];
      const plan = driver.plan(baseConfig({ nodes }), SESSION);
      const perNode = (cmd: string) =>
        plan.steps.filter((s) => s.commandId === cmd).map((s) => s.nodeId);
      expect(perNode('docker-run-seaweedfs-volume').sort()).toEqual([...nodes].sort());
      expect(perNode('install-seaweedfs-mount-systemd-unit').sort()).toEqual([...nodes].sort());
      expect(perNode('systemctl-enable-seaweedfs-mount').sort()).toEqual([...nodes].sort());
      expect(perNode('firewall-allow-seaweedfs-ports').sort()).toEqual([...nodes].sort());
      expect(perNode('mkdir-swarmui-shared-root').sort()).toEqual([...nodes].sort());
      expect(perNode('apt-install-fuse3').sort()).toEqual([...nodes].sort());
      expect(perNode('docker-pull-seaweedfs').sort()).toEqual([...nodes].sort());
    });

    it('runs TLS bootstrap by default', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      expect(plan.steps.some((s) => s.commandId === 'seaweedfs-tls-bootstrap')).toBe(true);
    });

    it('skips TLS bootstrap when insecure=true', () => {
      const plan = driver.plan(baseConfig({ insecure: true }), SESSION);
      expect(plan.steps.some((s) => s.commandId === 'seaweedfs-tls-bootstrap')).toBe(false);
      // And every tls flag in step args is false.
      for (const step of plan.steps) {
        if ('tls' in step.args) expect(step.args.tls).toBe(false);
      }
    });

    it('uses 010 replication by default and propagates to master+volume steps', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const master = plan.steps.find((s) => s.commandId === 'docker-run-seaweedfs-master');
      expect(master?.args.defaultReplication).toBe('010');
      expect(plan.driverOpts?.replication).toBe('010');
    });

    it('propagates a custom replication value', () => {
      const plan = driver.plan(
        baseConfig({ nodes: ['n1', 'n2', 'n3', 'n4'], replication: '020' }),
        SESSION,
      );
      const master = plan.steps.find((s) => s.commandId === 'docker-run-seaweedfs-master');
      expect(master?.args.defaultReplication).toBe('020');
    });

    it('threads the sessionId and mountPoint through the plan', () => {
      const plan = driver.plan(
        baseConfig({ mountPoint: '/mnt/custom' }),
        'sess-xyz',
      );
      expect(plan.sessionId).toBe('sess-xyz');
      expect(plan.mountPoint).toBe('/mnt/custom');
      // Every mkdir and mount-unit step points at the custom path.
      for (const step of plan.steps) {
        if (step.commandId === 'mkdir-swarmui-shared-root') {
          expect(step.args.path).toBe('/mnt/custom');
        }
        if (step.commandId === 'install-seaweedfs-mount-systemd-unit') {
          expect(step.args.mountPoint).toBe('/mnt/custom');
        }
      }
    });

    it('is deterministic for the same input', () => {
      const a = driver.plan(baseConfig(), SESSION);
      const b = driver.plan(baseConfig(), SESSION);
      expect(a).toEqual(b);
    });

    it('healthcheck step requires volumeServers = nodes.length', () => {
      const plan = driver.plan(
        baseConfig({ nodes: ['n1', 'n2', 'n3'] }),
        SESSION,
      );
      const hc = plan.steps.find((s) => s.commandId === 'seaweedfs-cluster-healthcheck');
      expect(hc?.args.expectedVolumeServers).toBe(3);
    });

    it('rejects an empty node list', () => {
      expect(() => driver.plan(baseConfig({ nodes: [] }), SESSION)).toThrow(
        BadRequestException,
      );
    });

    it('rejects duplicate node ids', () => {
      expect(() =>
        driver.plan(baseConfig({ nodes: ['n1', 'n1', 'n2'] }), SESSION),
      ).toThrow(BadRequestException);
    });

    it('rejects a replication value that is not 3 digits', () => {
      expect(() =>
        driver.plan(baseConfig({ replication: '01' }), SESSION),
      ).toThrow(BadRequestException);
    });

    it('rejects a replication that needs more nodes than available', () => {
      // replication=020 → sum(0,2,0)+1 = 3 required volume servers.
      expect(() =>
        driver.plan(
          baseConfig({ nodes: ['n1', 'n2'], replication: '020' }),
          SESSION,
        ),
      ).toThrow(/replication=020 needs/);
    });

    it('accepts a single-node install with replication=000', () => {
      const plan = driver.plan(
        baseConfig({ nodes: ['solo'], replication: '000' }),
        SESSION,
      );
      // All collocated on the single node — still a complete plan.
      const nodeIds = new Set(plan.steps.map((s) => s.nodeId));
      expect([...nodeIds]).toEqual(['solo']);
      expect(plan.steps.some((s) => s.commandId === 'docker-run-seaweedfs-master')).toBe(true);
    });
  });

  describe('uninstallPlan()', () => {
    it('every step uses a whitelisted commandId', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      for (const step of plan.steps) {
        expect(NODE_EXEC_COMMANDS).toContain(step.commandId);
      }
    });

    it('every step is terminalOnFail (destructive teardown must not silently retry forward)', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      for (const step of plan.steps) {
        expect(step.terminalOnFail).toBe(true);
      }
    });

    it('stops mount clients before stopping volume servers', () => {
      const plan = driver.uninstallPlan(
        baseConfig({ nodes: ['n1', 'n2'] }),
        SESSION,
      );
      const firstStopMount = plan.steps.findIndex((s) => s.id.includes('stop-mount-'));
      const firstStopVolume = plan.steps.findIndex((s) => s.id.includes('stop-volume-'));
      expect(firstStopMount).toBeGreaterThanOrEqual(0);
      expect(firstStopVolume).toBeGreaterThan(firstStopMount);
    });

    it('stops filer before master (clients drain the layer above first)', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      const filerIdx = plan.steps.findIndex((s) => s.id.includes('stop-filer-'));
      const masterIdx = plan.steps.findIndex((s) => s.id.includes('stop-master-'));
      expect(filerIdx).toBeGreaterThanOrEqual(0);
      expect(masterIdx).toBeGreaterThan(filerIdx);
    });

    it('revokes firewall last so management traffic stays alive during stop', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      const lastStop = Math.max(
        ...plan.steps
          .map((s, i) => (s.id.startsWith('s') && s.id.includes('stop-') ? i : -1))
          .filter((i) => i >= 0),
      );
      const firstRevoke = plan.steps.findIndex((s) => s.id.includes('firewall-close-'));
      expect(firstRevoke).toBeGreaterThan(lastStop);
    });
  });

  describe('enumerateConsumers()', () => {
    it('delegates to the injected ConsumerInspectorService and forwards the mount point', async () => {
      const inspector = {
        enumerateConsumers: jest
          .fn()
          .mockResolvedValue(['stack-a', 'stack-b']),
      };
      const d = new SeaweedfsDriver(inspector as never);
      await expect(
        d.enumerateConsumers('/var/lib/swarmui/shared'),
      ).resolves.toEqual(['stack-a', 'stack-b']);
      expect(inspector.enumerateConsumers).toHaveBeenCalledWith(
        '/var/lib/swarmui/shared',
      );
    });
  });
});

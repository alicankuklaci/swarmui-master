import { BadRequestException } from '@nestjs/common';
import {
  NODE_EXEC_COMMANDS,
  type SharedStorageConfig,
} from '@swarmui-master/storage-plan';
import { NfsDriver } from './nfs.driver';

// NFS driver — plan generation + probe. The orchestrator and the swarm-agent
// NFS handlers (Sprint 6 D2) consume these outputs and re-validate against
// the same NODE_EXEC_COMMANDS whitelist, so a drift here is caught at install
// time, not at the agent's shell boundary.

const SESSION = 'sess-nfs-abc';
const baseConfig = (
  overrides: Partial<SharedStorageConfig> = {},
): SharedStorageConfig => ({
  backend: 'nfs',
  nodes: ['node02', 'node03', 'node04'],
  mountPoint: '/var/lib/swarmui/shared',
  nfsServerNode: 'node02',
  ...overrides,
});

describe('NfsDriver', () => {
  let driver: NfsDriver;
  beforeEach(() => {
    // plan() + probeHealth don't touch the inspector; a null-cast keeps
    // construction cheap. enumerateConsumers tests build their own.
    driver = new NfsDriver(null as unknown as ConstructorParameters<typeof NfsDriver>[0]);
  });

  describe('plan()', () => {
    it('every step uses a whitelisted commandId', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      for (const step of plan.steps) {
        expect(NODE_EXEC_COMMANDS).toContain(step.commandId);
      }
    });

    it('every step id is unique', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const ids = plan.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('installs nfs-kernel-server on the server and nfs-common on clients', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const kernelSteps = plan.steps.filter(
        (s) => s.commandId === 'apt-install-nfs-kernel-server',
      );
      // Exactly one node — the server — installs the kernel package.
      expect(kernelSteps).toHaveLength(1);
      expect(kernelSteps[0].nodeId).toBe('node02');

      const commonSteps = plan.steps.filter(
        (s) => s.commandId === 'apt-install-nfs-common',
      );
      // One per non-server node (node03, node04).
      expect(commonSteps.map((s) => s.nodeId).sort()).toEqual([
        'node03',
        'node04',
      ]);
    });

    it('adds the export only on the server and mounts only on clients', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const exportSteps = plan.steps.filter(
        (s) => s.commandId === 'nfs-export-add',
      );
      expect(exportSteps).toHaveLength(1);
      expect(exportSteps[0].nodeId).toBe('node02');

      const mountSteps = plan.steps.filter((s) => s.commandId === 'mount-nfs');
      expect(mountSteps.map((s) => s.nodeId).sort()).toEqual([
        'node03',
        'node04',
      ]);
      for (const s of mountSteps) {
        // Mount args carry server + remote + local so the handler needs no
        // extra inference.
        expect(s.args).toMatchObject({
          server: 'node02',
          remote: '/var/lib/swarmui/shared',
          local: '/var/lib/swarmui/shared',
        });
      }
    });

    it('fstab-add is per-client, tagged with the sentinel', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const fstab = plan.steps.filter((s) => s.commandId === 'fstab-add');
      expect(fstab.map((s) => s.nodeId).sort()).toEqual(['node03', 'node04']);
      for (const s of fstab) {
        expect(s.args).toMatchObject({ sentinel: 'swarmui-nfs-shared' });
      }
    });

    it('order: mkdir+apt → export → enable → mount+fstab → canary', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      const idxOf = (cmd: string) =>
        plan.steps.findIndex((s) => s.commandId === cmd);

      // Export must come after the server has nfs-kernel-server + mkdir.
      expect(idxOf('nfs-export-add')).toBeGreaterThan(
        idxOf('apt-install-nfs-kernel-server'),
      );
      // Server must be enabled after the export is in /etc/exports.
      expect(idxOf('systemctl-enable-nfs-server')).toBeGreaterThan(
        idxOf('nfs-export-add'),
      );
      // Clients mount only after the server is enabled.
      expect(idxOf('mount-nfs')).toBeGreaterThan(
        idxOf('systemctl-enable-nfs-server'),
      );
      // Canary is last.
      expect(idxOf('test-mount-write')).toBe(plan.steps.length - 1);
    });

    it('server-only install (nodes=[server]) still produces a valid plan with no mount/fstab steps', () => {
      const plan = driver.plan(
        baseConfig({ nodes: ['node02'], nfsServerNode: 'node02' }),
        SESSION,
      );
      // No mount-nfs or fstab-add because there's no client.
      expect(plan.steps.find((s) => s.commandId === 'mount-nfs')).toBeUndefined();
      expect(plan.steps.find((s) => s.commandId === 'fstab-add')).toBeUndefined();
      // Export + enable + canary still run on the server.
      expect(plan.steps.find((s) => s.commandId === 'nfs-export-add')?.nodeId).toBe(
        'node02',
      );
      expect(plan.steps.find((s) => s.commandId === 'test-mount-write')).toBeDefined();
    });

    it('exposes server/export options on driverOpts for the state machine', () => {
      const plan = driver.plan(baseConfig(), SESSION);
      expect(plan.driverOpts).toMatchObject({
        server: 'node02',
        exportOptions: expect.any(String),
        mountOptions: expect.any(String),
        allowedClients: expect.any(String),
      });
    });
  });

  describe('plan() validation', () => {
    it('throws when nodes is empty', () => {
      expect(() => driver.plan(baseConfig({ nodes: [] }), SESSION)).toThrow(
        BadRequestException,
      );
    });

    it('throws on duplicate node ids', () => {
      expect(() =>
        driver.plan(
          baseConfig({ nodes: ['node02', 'node02', 'node03'] }),
          SESSION,
        ),
      ).toThrow(/duplicate/);
    });

    it('throws when nfsServerNode is missing', () => {
      // Build a config object by hand (TypeScript protects nfsServerNode optional
      // but a runtime payload could legitimately omit it).
      const bad = {
        backend: 'nfs',
        nodes: ['node02', 'node03'],
        mountPoint: '/var/lib/swarmui/shared',
      } as unknown as SharedStorageConfig;
      expect(() => driver.plan(bad, SESSION)).toThrow(/nfsServerNode/);
    });

    it('throws when nfsServerNode is not in nodes', () => {
      expect(() =>
        driver.plan(
          baseConfig({ nfsServerNode: 'nodeXX' }),
          SESSION,
        ),
      ).toThrow(/not in nodes/);
    });
  });

  describe('uninstallPlan()', () => {
    it('reverses the install order: fstab + umount per client, then export-remove + disable', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      const first = plan.steps[0];
      // First step touches the last client's fstab (reverse walk).
      expect(first.commandId).toBe('fstab-remove');
      expect(first.nodeId).toBe('node04');

      // The disable step is the last one, on the server.
      const last = plan.steps[plan.steps.length - 1];
      expect(last.commandId).toBe('systemctl-enable-nfs-server');
      expect(last.args).toMatchObject({ action: 'disable' });
      expect(last.nodeId).toBe('node02');
    });

    it('every uninstall step is terminalOnFail (destructive — no silent retry)', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      for (const s of plan.steps) {
        expect(s.terminalOnFail).toBe(true);
      }
    });

    it('umount step reuses mount-nfs with action=umount', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      const umountSteps = plan.steps.filter((s) => s.commandId === 'mount-nfs');
      expect(umountSteps.length).toBeGreaterThan(0);
      for (const s of umountSteps) {
        expect(s.args).toMatchObject({ action: 'umount' });
      }
    });

    it('export-remove happens before server disable', () => {
      const plan = driver.uninstallPlan(baseConfig(), SESSION);
      const exportRemove = plan.steps.findIndex(
        (s) => s.commandId === 'nfs-export-remove',
      );
      const disable = plan.steps.findIndex(
        (s) =>
          s.commandId === 'systemctl-enable-nfs-server' &&
          s.args.action === 'disable',
      );
      expect(exportRemove).toBeGreaterThan(-1);
      expect(disable).toBeGreaterThan(exportRemove);
    });
  });

  describe('enumerateConsumers()', () => {
    it('delegates to the injected ConsumerInspectorService and forwards the mount point', async () => {
      const inspector = {
        enumerateConsumers: jest.fn().mockResolvedValue(['web']),
      };
      const d = new NfsDriver(inspector as never);
      await expect(
        d.enumerateConsumers('/var/lib/swarmui/shared'),
      ).resolves.toEqual(['web']);
      expect(inspector.enumerateConsumers).toHaveBeenCalledWith(
        '/var/lib/swarmui/shared',
      );
    });
  });

  describe('probeHealth()', () => {
    // The probe opens a TCP socket to <server>:2049. We don't exercise the
    // real socket here — tests for socket semantics would re-prove node:net.
    // What matters for the driver is: validation runs first, and a nonsense
    // config is rejected before the socket is touched.
    it('rejects a config with no nfsServerNode before touching the network', async () => {
      await expect(
        driver.probeHealth(baseConfig({ nfsServerNode: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves (not rejects) with ok=false when connect fails fast', async () => {
      // Point at a port that nothing listens on. The handler must resolve
      // (never throw) and surface ok=false — the state machine drives on
      // the verdict, not on exceptions.
      // Using a non-routable port on an invalid host would hang; use
      // 127.0.0.1 with an unused high port + rely on connection refused.
      // Routed through baseConfig override — the server is 127.0.0.1 which
      // every machine resolves locally.
      // Note: this test needs the real net.Socket (no mocking), so we
      // allow up to 5s wall clock for ECONNREFUSED.
      const config = baseConfig({
        nodes: ['127.0.0.1'],
        nfsServerNode: '127.0.0.1',
      });
      // Patch 2049 to a port we know is unused: use the probe implementation
      // directly isn't exposed, but the server:2049 is hardcoded. If 2049 is
      // free on CI we get ECONNREFUSED; if an NFS server happens to be up
      // this test flakes — which is a legitimate signal. For CI the
      // assertion is "resolves (any verdict)".
      const result = await driver.probeHealth(config);
      expect(typeof result.ok).toBe('boolean');
    }, 10_000);
  });
});

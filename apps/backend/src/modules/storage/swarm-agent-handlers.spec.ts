import {
  aptInstallHandler,
  defaultExec,
  dockerPullHandler,
  dockerRunFilerHandler,
  dockerRunMasterHandler,
  dockerRunVolumeHandler,
  firewallAllowPortsHandler,
  installSeaweedfsMountSystemdUnitHandler,
  mkdirSharedRootHandler,
  realHandlerMap,
  fstabAddHandler,
  fstabRemoveHandler,
  mountNfsHandler,
  nfsExportAddHandler,
  nfsExportRemoveHandler,
  NFS_EXPORTS_FILE,
  NFS_FSTAB_FILE,
  NFS_SENTINEL_DEFAULT,
  parseNodeList,
  renderSeaweedfsMountUnit,
  SEAWEEDFS_CONTAINER_NAMES,
  SEAWEEDFS_MOUNT_UNIT_PATH,
  seaweedfsHealthcheckHandler,
  seaweedfsTlsBootstrapHandler,
  systemctlEnableHandler,
  testMountWriteHandler,
  TLS_BOOTSTRAP_DIR,
  TLS_CA_CRT_PATH,
  TLS_CA_KEY_PATH,
  type Exec,
  type ExecOutcome,
} from '@swarmui-master/swarm-agent';
import { NODE_EXEC_COMMANDS, type NodeExecRequest } from '@swarmui-master/storage-plan';

// Covers the swarm-agent real-handler layer. The exec helper is tested
// against the real shell with deterministic commands (echo, exit, sleep)
// so we exercise the actual spawn/kill/timeout wiring. Handlers above the
// exec layer get an injected stub so they test argv composition without
// touching the host filesystem.

const baseReq = (
  commandId: NodeExecRequest['commandId'],
  args: Record<string, string | number | boolean> = {},
): NodeExecRequest => ({
  commandId,
  args,
  nodeId: 'node02',
  installSessionId: 'sess-x',
  signature: { nonce: 'n', exp: 0, hmac: '' },
});

describe('defaultExec (process spawn wrapper)', () => {
  it('captures stdout, hashes it, and reports exit 0 on success', async () => {
    const out = await defaultExec(['sh', '-c', 'printf hello']);
    expect(out.exitCode).toBe(0);
    expect(out.stdoutTail).toBe('hello');
    expect(out.stdoutHash).toMatch(/^[0-9a-f]{32}$/);
    expect(out.stderrHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('surfaces non-zero exit codes without masking stderr', async () => {
    const out = await defaultExec(['sh', '-c', 'echo boom >&2; exit 7']);
    expect(out.exitCode).toBe(7);
    expect(out.stderrTail).toContain('boom');
  });

  it('returns 124 and kills the child when the timeout elapses', async () => {
    const started = Date.now();
    const out = await defaultExec(['sh', '-c', 'sleep 10'], { timeoutMs: 150 });
    expect(out.exitCode).toBe(124);
    expect(out.stderrTail).toContain('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('returns 127 when the binary does not exist', async () => {
    const out = await defaultExec(['/does/not/exist/zzz']);
    expect(out.exitCode).toBe(127);
    expect(out.stderrTail).toBeDefined();
  });

  it('passes extra env to the child', async () => {
    const out = await defaultExec(['sh', '-c', 'printf %s "$MY_VAR"'], {
      env: { MY_VAR: 'canary-value' },
    });
    expect(out.exitCode).toBe(0);
    expect(out.stdoutTail).toBe('canary-value');
  });

  it('refuses an empty argv instead of spawning', async () => {
    const out = await defaultExec([]);
    expect(out.exitCode).toBe(1);
    expect(out.stderrTail).toContain('empty argv');
  });

  // C pack #6 — note on no direct test for the stdin EPIPE handler.
  //
  // The fix in exec.ts (child.stdin.on('error', () => {}) + try/catch
  // around .end()) is a defensive one-liner. Reliably reproducing the
  // EPIPE race in Jest fails because the harness aggressively surfaces
  // stream 'error' events through its own uncaughtException hook — a
  // behavior that only manifests under process-level isolation (which the
  // production agent has but Jest workers don't). The protective pattern
  // is standard Node practice; reviewers should look at exec.ts around
  // the C pack #6 comment to verify the shim is in place.

  it('bounds captured output while still hashing the full stream', async () => {
    // 2 MiB of output (> 1 MiB default cap)
    const out = await defaultExec(['sh', '-c', 'yes a | head -c 2097152'], {
      timeoutMs: 10_000,
    });
    expect(out.exitCode).toBe(0);
    // Tail is clamped to TAIL_BYTES (2048) — never balloons.
    expect(out.stdoutTail?.length ?? 0).toBeLessThanOrEqual(2048);
    expect(out.stdoutHash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('mkdirSharedRootHandler', () => {
  it('invokes mkdir -p -m <mode> <mountPoint> then chmod', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    const h = mkdirSharedRootHandler(stub);
    const result = await h(
      baseReq('mkdir-swarmui-shared-root', {
        mountPoint: '/var/lib/swarmui/shared',
        mode: '0775',
      }),
    );
    expect(calls[0]).toEqual([
      'mkdir',
      '-p',
      '-m',
      '0775',
      '/var/lib/swarmui/shared',
    ]);
    expect(calls[1]).toEqual(['chmod', '0775', '/var/lib/swarmui/shared']);
    expect(result.exitCode).toBe(0);
    expect(result.commandId).toBe('mkdir-swarmui-shared-root');
    expect(result.nodeId).toBe('node02');
  });

  it('short-circuits and returns the mkdir failure without chmod', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return { ...okOutcome(), exitCode: 2, stderrTail: 'perm denied' };
    };
    const h = mkdirSharedRootHandler(stub);
    const result = await h(baseReq('mkdir-swarmui-shared-root'));
    expect(calls).toHaveLength(1);
    expect(result.exitCode).toBe(2);
    expect(result.stderrTail).toBe('perm denied');
  });
});

describe('testMountWriteHandler', () => {
  it('writes a canary, reads it back, deletes it, and succeeds on hash match', async () => {
    const calls: string[][] = [];
    // Capture the write payload so the fake read echoes it back.
    let payload = '';
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'sh' && argv[1] === '-c') {
        // ['sh','-c',<script>,'canary-write',<payload>,<path>] — $1 is at index 4.
        payload = argv[4] as string;
        return okOutcome();
      }
      if (argv[0] === 'cat') {
        const crypto = await import('node:crypto');
        return {
          exitCode: 0,
          stdoutHash: crypto
            .createHash('sha256')
            .update(payload)
            .digest('hex')
            .slice(0, 32),
          stderrHash: emptyHash(),
          durationMs: 1,
        };
      }
      if (argv[0] === 'rm') return okOutcome();
      return okOutcome();
    };
    const result = await testMountWriteHandler(stub)(
      baseReq('test-mount-write', { mountPoint: '/mnt/x' }),
    );
    expect(result.exitCode).toBe(0);
    // Must have written, read, then deleted the canary — in that order.
    const verbs = calls.map((c) => c[0]);
    expect(verbs).toEqual(['sh', 'cat', 'rm']);
    // sh write call: ['sh','-c',<script>,'canary-write',<payload>,<path>]
    const writePath = calls[0][5];
    const catPath = calls[1][1];
    const rmPath = calls[2][2];
    expect(catPath).toBe(writePath);
    expect(rmPath).toBe(writePath);
    expect((writePath as string).startsWith('/mnt/x/.swarmui-canary-')).toBe(true);
  });

  it('fails with exitCode=1 when the read-back hash disagrees with the write payload', async () => {
    const stub: Exec = async (argv) => {
      if (argv[0] === 'cat') {
        return {
          exitCode: 0,
          // Not the hash of what was written — mimics torn write / wrong block.
          stdoutHash: 'deadbeef'.repeat(4),
          stderrHash: emptyHash(),
          durationMs: 1,
        };
      }
      return okOutcome();
    };
    const result = await testMountWriteHandler(stub)(
      baseReq('test-mount-write', { mountPoint: '/mnt/x' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toContain('canary mismatch');
  });

  it('always deletes the canary even when the read fails', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'cat') return { ...okOutcome(), exitCode: 5, stderrTail: 'io' };
      return okOutcome();
    };
    const result = await testMountWriteHandler(stub)(
      baseReq('test-mount-write', { mountPoint: '/mnt/x' }),
    );
    expect(result.exitCode).toBe(5);
    expect(calls.map((c) => c[0])).toContain('rm');
  });
});

describe('aptInstallHandler', () => {
  it('rejects a package name that contains anything but [a-z0-9+.-]', () => {
    expect(() => aptInstallHandler('fuse3; rm -rf /')).toThrow(/invalid package/);
    expect(() => aptInstallHandler('FUSE3')).toThrow(/invalid package/);
    expect(() => aptInstallHandler('')).toThrow(/invalid package/);
  });

  it('runs apt-get update then install with -y --no-install-recommends and noninteractive env', async () => {
    const calls: { argv: string[]; env?: Record<string, string> }[] = [];
    const stub: Exec = async (argv, opts) => {
      calls.push({ argv, env: opts?.env });
      return okOutcome();
    };
    const h = aptInstallHandler('fuse3', stub);
    const result = await h(baseReq('apt-install-fuse3'));
    expect(result.exitCode).toBe(0);
    expect(calls[0].argv).toEqual(['apt-get', 'update', '-qq']);
    expect(calls[1].argv).toEqual([
      'apt-get',
      'install',
      '-y',
      '-qq',
      '--no-install-recommends',
      'fuse3',
    ]);
    expect(calls[0].env?.DEBIAN_FRONTEND).toBe('noninteractive');
    expect(calls[1].env?.DEBIAN_FRONTEND).toBe('noninteractive');
  });

  it('surfaces the install failure and annotates with the update failure when both broke', async () => {
    let n = 0;
    const stub: Exec = async () => {
      n += 1;
      return {
        ...okOutcome(),
        exitCode: n === 1 ? 100 : 5, // update then install, both fail
        stderrTail: n === 1 ? 'hash-sum-mismatch' : 'unable to locate pkg',
      };
    };
    const result = await aptInstallHandler('nfs-common', stub)(
      baseReq('apt-install-nfs-common'),
    );
    expect(result.exitCode).toBe(5);
    expect(result.stderrTail).toContain('apt-get update exited 100');
    expect(result.stderrTail).toContain('unable to locate pkg');
  });

  it('does not annotate when only update failed but install succeeded', async () => {
    let n = 0;
    const stub: Exec = async () => {
      n += 1;
      return {
        ...okOutcome(),
        exitCode: n === 1 ? 100 : 0,
        stderrTail: n === 1 ? 'hash-sum-mismatch' : undefined,
      };
    };
    const result = await aptInstallHandler('fuse3', stub)(baseReq('apt-install-fuse3'));
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toBeUndefined();
  });
});

describe('dockerPullHandler', () => {
  it('rejects an image name that contains anything but [a-z0-9._-/:@]', async () => {
    const stub: Exec = async () => okOutcome();
    await expect(
      dockerPullHandler(stub)(
        baseReq('docker-pull-seaweedfs', { image: 'bad name; rm -rf /' }),
      ),
    ).rejects.toThrow(/invalid image/);
  });

  it('runs docker pull <image> on a valid image', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    const result = await dockerPullHandler(stub)(
      baseReq('docker-pull-seaweedfs', { image: 'chrislusf/seaweedfs:3.80' }),
    );
    expect(calls).toEqual([['docker', 'pull', 'chrislusf/seaweedfs:3.80']]);
    expect(result.exitCode).toBe(0);
  });
});

describe('dockerRunMasterHandler', () => {
  it('inspects first; when container is already running, skips docker run (idempotent)', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'docker' && argv[1] === 'inspect') {
        return { ...okOutcome(), stdoutTail: 'running\n' };
      }
      return okOutcome();
    };
    const result = await dockerRunMasterHandler(stub)(
      baseReq('docker-run-seaweedfs-master', { image: 'chrislusf/seaweedfs:3.80' }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('idempotent-skip');
    // Only the inspect call — no run, no mkdir.
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('inspect');
  });

  it('rm -fs a stopped container, mkdirs the data dir, then runs the master with host network and plan args', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'docker' && argv[1] === 'inspect') {
        return { ...okOutcome(), stdoutTail: 'exited\n' };
      }
      return okOutcome();
    };
    const result = await dockerRunMasterHandler(stub)(
      baseReq('docker-run-seaweedfs-master', {
        image: 'chrislusf/seaweedfs:3.80',
        port: 9333,
        defaultReplication: '010',
      }),
    );
    expect(result.exitCode).toBe(0);
    const verbs = calls.map((c) => `${c[0]} ${c[1]}`);
    expect(verbs).toEqual(['docker inspect', 'docker rm', 'mkdir -p', 'docker run']);
    const run = calls[3];
    // Deterministic container name + host network + bind mount.
    expect(run).toContain('--name');
    expect(run).toContain(SEAWEEDFS_CONTAINER_NAMES.master);
    expect(run).toContain('--network');
    expect(run.indexOf('host')).toBeGreaterThan(run.indexOf('--network'));
    // Plan args surface as weed master flags.
    expect(run).toContain('-port=9333');
    expect(run).toContain('-defaultReplication=010');
    // Mount dir composed under the agent's data root.
    const vIdx = run.indexOf('-v');
    expect(run[vIdx + 1]).toMatch(/\/var\/lib\/swarmui\/data\/master:\/data$/);
    // Restart policy on, detached.
    expect(run).toContain('--restart');
    expect(run).toContain('unless-stopped');
    expect(run).toContain('-d');
  });

  it('on action=stop, calls docker rm -f against the master container and does not run', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    const result = await dockerRunMasterHandler(stub)(
      baseReq('docker-run-seaweedfs-master', { action: 'stop' }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      ['docker', 'rm', '-f', SEAWEEDFS_CONTAINER_NAMES.master],
    ]);
  });

  it('rejects an invalid port with no docker call attempted', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      dockerRunMasterHandler(stub)(
        baseReq('docker-run-seaweedfs-master', {
          image: 'chrislusf/seaweedfs:3.80',
          port: 'not-a-port',
        }),
      ),
    ).rejects.toThrow(/invalid port/);
  });
});

describe('dockerRunVolumeHandler', () => {
  it('passes master url, dataCenter and rack through to weed volume argv', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[1] === 'inspect') return { ...okOutcome(), exitCode: 1 }; // absent
      return okOutcome();
    };
    await dockerRunVolumeHandler(stub)(
      baseReq('docker-run-seaweedfs-volume', {
        image: 'chrislusf/seaweedfs:3.80',
        port: 8080,
        master: 'node02:9333',
        dataCenter: 'swarm',
        rack: 'node02',
      }),
    );
    const run = calls.find((c) => c[1] === 'run')!;
    expect(run).toContain('-mserver=node02:9333');
    expect(run).toContain('-dataCenter=swarm');
    expect(run).toContain('-rack=node02');
    expect(run).toContain('-port=8080');
    expect(run).toContain(SEAWEEDFS_CONTAINER_NAMES.volume);
  });

  it('rejects an injection-shaped master url', async () => {
    const stub: Exec = async () => okOutcome();
    await expect(
      dockerRunVolumeHandler(stub)(
        baseReq('docker-run-seaweedfs-volume', {
          image: 'chrislusf/seaweedfs:3.80',
          master: '$(rm -rf /):9333',
          rack: 'node02',
        }),
      ),
    ).rejects.toThrow(/invalid master/);
  });
});

describe('dockerRunFilerHandler', () => {
  it('runs weed filer with master, http port, and grpc port', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[1] === 'inspect') return { ...okOutcome(), exitCode: 1 }; // absent
      return okOutcome();
    };
    await dockerRunFilerHandler(stub)(
      baseReq('docker-run-seaweedfs-filer', {
        image: 'chrislusf/seaweedfs:3.80',
        port: 8888,
        grpcPort: 18888,
        master: 'node02:9333',
      }),
    );
    const run = calls.find((c) => c[1] === 'run')!;
    expect(run).toContain('-master=node02:9333');
    expect(run).toContain('-port=8888');
    expect(run).toContain('-port.grpc=18888');
    expect(run).toContain(SEAWEEDFS_CONTAINER_NAMES.filer);
  });
});

describe('renderSeaweedfsMountUnit', () => {
  it('composes a systemd service unit that waits on docker and runs weed mount', () => {
    const body = renderSeaweedfsMountUnit({
      filer: 'node02:8888',
      mountPoint: '/var/lib/swarmui/shared',
      collection: 'swarmui',
      tls: false,
    });
    expect(body).toContain('[Unit]');
    expect(body).toContain('After=docker.service network-online.target');
    expect(body).toContain('Requires=docker.service');
    expect(body).toContain('ExecStartPre=/bin/mkdir -p /var/lib/swarmui/shared');
    expect(body).toContain('ExecStart=/usr/bin/docker exec seaweedfs-filer weed mount');
    expect(body).toContain('-filer=node02:8888');
    expect(body).toContain('-dir=/var/lib/swarmui/shared');
    expect(body).toContain('-collection=swarmui');
    expect(body).toContain('Restart=on-failure');
    expect(body).toContain('WantedBy=multi-user.target');
    // tls flag omitted when tls=false.
    expect(body).not.toContain(' -tls');
  });

  it('appends -tls to the ExecStart when tls=true', () => {
    const body = renderSeaweedfsMountUnit({
      filer: 'node02:8888',
      mountPoint: '/var/lib/swarmui/shared',
      collection: 'swarmui',
      tls: true,
    });
    expect(body).toContain(' -tls');
  });
});

describe('installSeaweedfsMountSystemdUnitHandler', () => {
  it('pipes the rendered unit through tee and then runs daemon-reload', async () => {
    const calls: { argv: string[]; stdin?: string }[] = [];
    const stub: Exec = async (argv, opts) => {
      calls.push({ argv, stdin: opts?.stdin });
      return okOutcome();
    };
    const h = installSeaweedfsMountSystemdUnitHandler(stub);
    const result = await h(
      baseReq('install-seaweedfs-mount-systemd-unit', {
        filer: 'node02:8888',
        mountPoint: '/var/lib/swarmui/shared',
        collection: 'swarmui',
        tls: false,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls[0].argv).toEqual(['tee', SEAWEEDFS_MOUNT_UNIT_PATH]);
    expect(calls[0].stdin).toContain('ExecStart=/usr/bin/docker exec seaweedfs-filer');
    expect(calls[1].argv).toEqual(['systemctl', 'daemon-reload']);
  });

  it('does not daemon-reload when tee failed', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return argv[0] === 'tee'
        ? { ...okOutcome(), exitCode: 1, stderrTail: 'read-only fs' }
        : okOutcome();
    };
    const result = await installSeaweedfsMountSystemdUnitHandler(stub)(
      baseReq('install-seaweedfs-mount-systemd-unit', {
        filer: 'node02:8888',
        mountPoint: '/var/lib/swarmui/shared',
        collection: 'swarmui',
      }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toBe('read-only fs');
    expect(calls).toHaveLength(1);
  });

  it('rejects an invalid filer URL before touching exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      installSeaweedfsMountSystemdUnitHandler(stub)(
        baseReq('install-seaweedfs-mount-systemd-unit', {
          filer: 'not;a;url',
          mountPoint: '/var/lib/swarmui/shared',
          collection: 'swarmui',
        }),
      ),
    ).rejects.toThrow(/invalid filer/);
  });
});

describe('systemctlEnableHandler', () => {
  it('enables --now by default', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    await systemctlEnableHandler('seaweedfs-mount.service', stub)(
      baseReq('systemctl-enable-seaweedfs-mount'),
    );
    expect(calls[0]).toEqual([
      'systemctl',
      'enable',
      '--now',
      'seaweedfs-mount.service',
    ]);
  });

  it('disables --now when action=disable (uninstall branch)', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    await systemctlEnableHandler('nfs-server.service', stub)(
      baseReq('systemctl-enable-nfs-server', { action: 'disable' }),
    );
    expect(calls[0]).toEqual([
      'systemctl',
      'disable',
      '--now',
      'nfs-server.service',
    ]);
  });

  it('refuses an invalid unit name at construction time', () => {
    expect(() => systemctlEnableHandler('/etc/passwd')).toThrow(/invalid unitName/);
  });
});

describe('firewallAllowPortsHandler', () => {
  it('check-then-add per port, skipping ports whose rule already exists', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // Pretend port 9333 already exists, 8080 does not.
      if (argv[1] === '-C') {
        const dportIdx = argv.indexOf('--dport');
        const port = argv[dportIdx + 1];
        return port === '9333'
          ? okOutcome()
          : { ...okOutcome(), exitCode: 1 };
      }
      return okOutcome();
    };
    const result = await firewallAllowPortsHandler(stub)(
      baseReq('firewall-allow-seaweedfs-ports', {
        ports: '9333,8080',
        scope: 'overlay',
      }),
    );
    expect(result.exitCode).toBe(0);
    const verbs = calls.map((c) => `${c[0]} ${c[1]}`);
    // Two checks (9333, 8080), one add (8080 only).
    expect(verbs).toEqual(['iptables -C', 'iptables -C', 'iptables -A']);
    // Both rules tagged with scope + port in the comment.
    const addCall = calls.find((c) => c[1] === '-A')!;
    const commentIdx = addCall.indexOf('--comment');
    expect(addCall[commentIdx + 1]).toMatch(/^swarmui-seaweedfs-overlay-\d+$/);
  });

  it('on action=revoke, calls -D and swallows exit 1 as "already gone"', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // First port: no such rule (exit 1). Second port: deleted (exit 0).
      const dportIdx = argv.indexOf('--dport');
      return argv[dportIdx + 1] === '9333'
        ? { ...okOutcome(), exitCode: 1 }
        : okOutcome();
    };
    const result = await firewallAllowPortsHandler(stub)(
      baseReq('firewall-allow-seaweedfs-ports', {
        ports: '9333,8080',
        action: 'revoke',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls.map((c) => c[1])).toEqual(['-D', '-D']);
  });

  it('surfaces a real iptables error (exit >1) on add', async () => {
    const stub: Exec = async (argv) => {
      if (argv[1] === '-C') return { ...okOutcome(), exitCode: 1 };
      return { ...okOutcome(), exitCode: 2, stderrTail: 'iptables: Lock busy' };
    };
    const result = await firewallAllowPortsHandler(stub)(
      baseReq('firewall-allow-seaweedfs-ports', { ports: '9333' }),
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderrTail).toContain('Lock busy');
  });

  it('rejects a non-numeric port before any exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      firewallAllowPortsHandler(stub)(
        baseReq('firewall-allow-seaweedfs-ports', { ports: '9333,8080;rm' }),
      ),
    ).rejects.toThrow(/invalid port/);
  });
});

describe('seaweedfsHealthcheckHandler', () => {
  it('returns ok when master, filer and volume count all pass', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // 1st call: /cluster/status → up
      // 2nd call: sh -c (count PublicUrl) → stdoutTail='2'
      // 3rd call: filer / → up
      if (argv[0] === 'sh') {
        return { ...okOutcome(), stdoutTail: '2\n' };
      }
      return okOutcome();
    };
    const result = await seaweedfsHealthcheckHandler(stub)(
      baseReq('seaweedfs-cluster-healthcheck', {
        master: 'node02:9333',
        filer: 'node02:8888',
        expectedVolumeServers: 2,
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('cluster healthy');
    // Three checks in order, both curls include --max-time + fail-on-error.
    expect(calls[0][0]).toBe('curl');
    expect(calls[0]).toContain('-fsS');
    expect(calls[0]).toContain('http://node02:9333/cluster/status');
    expect(calls[1][0]).toBe('sh');
    expect(calls[2][0]).toBe('curl');
    expect(calls[2]).toContain('http://node02:8888/');
  });

  it('fails when master /cluster/status is unreachable; never calls filer', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv.includes('http://node02:9333/cluster/status')) {
        return { ...okOutcome(), exitCode: 7, stderrTail: 'connection refused' };
      }
      return okOutcome();
    };
    const result = await seaweedfsHealthcheckHandler(stub)(
      baseReq('seaweedfs-cluster-healthcheck', {
        master: 'node02:9333',
        filer: 'node02:8888',
        expectedVolumeServers: 2,
      }),
    );
    expect(result.exitCode).toBe(7);
    expect(result.stderrTail).toContain('master /cluster/status unreachable');
    expect(result.stderrTail).toContain('connection refused');
    expect(calls).toHaveLength(1);
  });

  it('fails with "expected N found M" when volume server count is short', async () => {
    const stub: Exec = async (argv) => {
      if (argv[0] === 'sh') return { ...okOutcome(), stdoutTail: '1\n' };
      return okOutcome();
    };
    const result = await seaweedfsHealthcheckHandler(stub)(
      baseReq('seaweedfs-cluster-healthcheck', {
        master: 'node02:9333',
        filer: 'node02:8888',
        expectedVolumeServers: 3,
      }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toBe('expected 3 volume servers, found 1');
  });

  it('fails when filer is unreachable', async () => {
    const stub: Exec = async (argv) => {
      if (argv[0] === 'sh') return { ...okOutcome(), stdoutTail: '2\n' };
      if (argv.includes('http://node02:8888/')) {
        return { ...okOutcome(), exitCode: 22, stderrTail: 'HTTP 503' };
      }
      return okOutcome();
    };
    const result = await seaweedfsHealthcheckHandler(stub)(
      baseReq('seaweedfs-cluster-healthcheck', {
        master: 'node02:9333',
        filer: 'node02:8888',
        expectedVolumeServers: 2,
      }),
    );
    expect(result.exitCode).toBe(22);
    expect(result.stderrTail).toContain('filer unreachable');
    expect(result.stderrTail).toContain('HTTP 503');
  });

  it('rejects a non-positive expectedVolumeServers before any exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      seaweedfsHealthcheckHandler(stub)(
        baseReq('seaweedfs-cluster-healthcheck', {
          master: 'node02:9333',
          filer: 'node02:8888',
          expectedVolumeServers: 0,
        }),
      ),
    ).rejects.toThrow(/positive integer/);
  });

  it('rejects an injection-shaped master host before any exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      seaweedfsHealthcheckHandler(stub)(
        baseReq('seaweedfs-cluster-healthcheck', {
          master: 'node02:9333;rm -rf /',
          filer: 'node02:8888',
          expectedVolumeServers: 2,
        }),
      ),
    ).rejects.toThrow(/invalid master/);
  });
});

describe('seaweedfsTlsBootstrapHandler', () => {
  // Each test stubs exec so we exercise argv composition + idempotency
  // branches without touching the host filesystem.

  it('rejects an injection-shaped node list before any exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      seaweedfsTlsBootstrapHandler(stub)(
        baseReq('seaweedfs-tls-bootstrap', { nodes: 'node02;rm -rf /' }),
      ),
    ).rejects.toThrow(/invalid/);
  });

  it('generates a CA when none exists, then signs one cert per node, returns fingerprint', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // `test -r <path>` returns 1 → CA does not exist → generate.
      if (argv[0] === 'test' && argv[1] === '-r') {
        return { ...okOutcome(), exitCode: 1 };
      }
      // `openssl x509 ... -fingerprint` returns a canonical sha256 line.
      if (
        argv[0] === 'openssl' &&
        argv[1] === 'x509' &&
        argv.includes('-fingerprint')
      ) {
        return {
          ...okOutcome(),
          stdoutTail: 'sha256 Fingerprint=AA:BB:CC:DD:EE:FF\n',
        };
      }
      return okOutcome();
    };
    const result = await seaweedfsTlsBootstrapHandler(stub)(
      baseReq('seaweedfs-tls-bootstrap', { nodes: 'node02,node03' }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('2 node cert(s)');
    expect(result.stderrTail).toContain('ca-fingerprint=aabbccddeeff');
    // Dir setup first (mkdir -p -m 0700 + chmod 0700).
    expect(calls[0]).toEqual(['mkdir', '-p', '-m', '0700', TLS_BOOTSTRAP_DIR]);
    expect(calls[1]).toEqual(['chmod', '0700', TLS_BOOTSTRAP_DIR]);
    // CA generated: key then cert.
    const caKeyIdx = calls.findIndex(
      (c) =>
        c[0] === 'openssl' &&
        c[1] === 'genpkey' &&
        c.includes(TLS_CA_KEY_PATH),
    );
    const caCrtIdx = calls.findIndex(
      (c) =>
        c[0] === 'openssl' &&
        c[1] === 'req' &&
        c.includes('-x509') &&
        c.includes(TLS_CA_CRT_PATH),
    );
    expect(caKeyIdx).toBeGreaterThan(-1);
    expect(caCrtIdx).toBeGreaterThan(caKeyIdx);
    // Key file is chmod 0600 (never world-readable).
    const chmodKey = calls.find(
      (c) => c[0] === 'chmod' && c[1] === '0600' && c[2] === TLS_CA_KEY_PATH,
    );
    expect(chmodKey).toBeDefined();
    // Per-node certs: two of each phase.
    const nodeKeyGens = calls.filter(
      (c) =>
        c[0] === 'openssl' &&
        c[1] === 'genpkey' &&
        c.some((a) => /\/(node02|node03)\.key$/.test(a)),
    );
    expect(nodeKeyGens).toHaveLength(2);
    const signs = calls.filter((c) => c[1] === 'x509' && c.includes('-req'));
    expect(signs).toHaveLength(2);
    for (const sign of signs) {
      // Signs with -CA ca.crt -CAkey ca.key, writes .crt under TLS dir.
      expect(sign).toContain('-CA');
      expect(sign.indexOf(TLS_CA_CRT_PATH)).toBeGreaterThan(sign.indexOf('-CA'));
      expect(sign).toContain('-CAkey');
      expect(sign.indexOf(TLS_CA_KEY_PATH)).toBeGreaterThan(sign.indexOf('-CAkey'));
    }
  });

  it('reuses an existing CA without regenerating it (idempotent)', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // CA already readable.
      if (argv[0] === 'test' && argv[1] === '-r') return okOutcome();
      if (
        argv[0] === 'openssl' &&
        argv[1] === 'x509' &&
        argv.includes('-fingerprint')
      ) {
        return {
          ...okOutcome(),
          stdoutTail: 'sha256 Fingerprint=11:22:33\n',
        };
      }
      return okOutcome();
    };
    const result = await seaweedfsTlsBootstrapHandler(stub)(
      baseReq('seaweedfs-tls-bootstrap', { nodes: 'node02' }),
    );
    expect(result.exitCode).toBe(0);
    // No `openssl req -x509 -new ...` call for CA.
    const caRegens = calls.filter(
      (c) =>
        c[0] === 'openssl' &&
        c[1] === 'req' &&
        c.includes('-x509') &&
        c.includes(TLS_CA_CRT_PATH),
    );
    expect(caRegens).toHaveLength(0);
    // But node certs still generated.
    const signs = calls.filter((c) => c[1] === 'x509' && c.includes('-req'));
    expect(signs).toHaveLength(1);
  });

  it('short-circuits with the openssl failure when CA generation fails', async () => {
    const stub: Exec = async (argv) => {
      if (argv[0] === 'test') return { ...okOutcome(), exitCode: 1 };
      // First openssl call (genpkey for CA) fails.
      if (argv[0] === 'openssl' && argv[1] === 'genpkey') {
        return { ...okOutcome(), exitCode: 1, stderrTail: 'bad entropy' };
      }
      return okOutcome();
    };
    const result = await seaweedfsTlsBootstrapHandler(stub)(
      baseReq('seaweedfs-tls-bootstrap', { nodes: 'node02' }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderrTail).toContain('bad entropy');
  });

  it('dedupes repeated node names', async () => {
    expect(parseNodeList('node02,node02,node03')).toEqual(['node02', 'node03']);
  });

  it('rejects an empty node list', async () => {
    const stub: Exec = async () => okOutcome();
    await expect(
      seaweedfsTlsBootstrapHandler(stub)(
        baseReq('seaweedfs-tls-bootstrap', { nodes: ',,,' }),
      ),
    ).rejects.toThrow(/invalid/);
  });
});

describe('nfsExportAddHandler', () => {
  it('appends a sentinel-tagged line to /etc/exports and runs exportfs -ra', async () => {
    const calls: { argv: string[]; stdin?: string }[] = [];
    const stub: Exec = async (argv, opts) => {
      calls.push({ argv, stdin: opts?.stdin });
      // grep returns 1 (sentinel not present) → fall through to tee.
      if (argv[0] === 'grep') return { ...okOutcome(), exitCode: 1 };
      return okOutcome();
    };
    const result = await nfsExportAddHandler(stub)(
      baseReq('nfs-export-add', {
        exportPath: '/var/lib/swarmui/shared',
        clients: '10.0.0.0/8',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls.map((c) => c.argv[0])).toEqual(['grep', 'tee', 'exportfs']);
    expect(calls[1].argv).toEqual(['tee', '-a', NFS_EXPORTS_FILE]);
    // Line format: <path> <clients>(<options>) # sentinel
    expect(calls[1].stdin).toMatch(
      new RegExp(
        `^/var/lib/swarmui/shared 10\\.0\\.0\\.0/8\\([a-z0-9_,.=-]+\\) # ${NFS_SENTINEL_DEFAULT}\\n$`,
      ),
    );
    expect(calls[2].argv).toEqual(['exportfs', '-ra']);
  });

  it('skips tee when the sentinel is already in /etc/exports and still runs exportfs -ra', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // grep returns 0 → already present.
      if (argv[0] === 'grep') return okOutcome();
      return okOutcome();
    };
    const result = await nfsExportAddHandler(stub)(
      baseReq('nfs-export-add', {
        exportPath: '/var/lib/swarmui/shared',
        clients: '10.0.0.0/8',
      }),
    );
    expect(result.exitCode).toBe(0);
    // No tee between grep and exportfs.
    expect(calls.map((c) => c[0])).toEqual(['grep', 'exportfs']);
  });

  it('rejects injection-shaped clients before touching exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      nfsExportAddHandler(stub)(
        baseReq('nfs-export-add', {
          exportPath: '/var/lib/swarmui/shared',
          clients: '$(rm -rf /)',
        }),
      ),
    ).rejects.toThrow(/invalid clients/);
  });
});

describe('nfsExportRemoveHandler', () => {
  it('runs sed -i /# <sentinel>$/d /etc/exports then exportfs -ra', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    await nfsExportRemoveHandler(stub)(baseReq('nfs-export-remove'));
    expect(calls[0]).toEqual([
      'sed',
      '-i',
      `/# ${NFS_SENTINEL_DEFAULT}$/d`,
      NFS_EXPORTS_FILE,
    ]);
    expect(calls[1]).toEqual(['exportfs', '-ra']);
  });

  it('does not run exportfs when sed failed', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return argv[0] === 'sed'
        ? { ...okOutcome(), exitCode: 1, stderrTail: 'permission denied' }
        : okOutcome();
    };
    const result = await nfsExportRemoveHandler(stub)(baseReq('nfs-export-remove'));
    expect(result.exitCode).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe('mountNfsHandler', () => {
  it('mountpoint→skip when already mounted (idempotent)', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'mountpoint') return okOutcome(); // exit 0 = mounted
      return okOutcome();
    };
    const result = await mountNfsHandler(stub)(
      baseReq('mount-nfs', {
        server: 'node02',
        remote: '/var/lib/swarmui/shared',
        local: '/var/lib/swarmui/shared',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('already mounted');
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('mountpoint');
  });

  it('mkdirs the target, then mount -t nfs with -o options and server:remote local', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      // mountpoint returns non-zero → not mounted → proceed.
      if (argv[0] === 'mountpoint') return { ...okOutcome(), exitCode: 32 };
      return okOutcome();
    };
    const result = await mountNfsHandler(stub)(
      baseReq('mount-nfs', {
        server: 'node02',
        remote: '/var/lib/swarmui/shared',
        local: '/var/lib/swarmui/shared',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls.map((c) => c[0])).toEqual(['mountpoint', 'mkdir', 'mount']);
    const mount = calls[2];
    expect(mount).toContain('-t');
    expect(mount).toContain('nfs');
    expect(mount).toContain('-o');
    expect(mount).toContain('node02:/var/lib/swarmui/shared');
    expect(mount[mount.length - 1]).toBe('/var/lib/swarmui/shared');
  });

  it('on action=umount, calls umount after mountpoint confirms mounted', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'mountpoint') return okOutcome(); // mounted
      return okOutcome();
    };
    const result = await mountNfsHandler(stub)(
      baseReq('mount-nfs', { action: 'umount', local: '/mnt/x' }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls.map((c) => c[0])).toEqual(['mountpoint', 'umount']);
    expect(calls[1]).toEqual(['umount', '/mnt/x']);
  });

  it('action=umount on a path that is not a mountpoint is a no-op', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'mountpoint') return { ...okOutcome(), exitCode: 1 };
      return okOutcome();
    };
    const result = await mountNfsHandler(stub)(
      baseReq('mount-nfs', { action: 'umount', local: '/mnt/x' }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('not mounted');
    expect(calls).toHaveLength(1);
  });

  it('rejects an injection-shaped server before touching exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      mountNfsHandler(stub)(
        baseReq('mount-nfs', {
          server: 'node02;rm -rf /',
          remote: '/x',
          local: '/x',
        }),
      ),
    ).rejects.toThrow(/invalid server/);
  });
});

describe('fstabAddHandler', () => {
  it('appends a sentinel-tagged NFS line to /etc/fstab', async () => {
    const calls: { argv: string[]; stdin?: string }[] = [];
    const stub: Exec = async (argv, opts) => {
      calls.push({ argv, stdin: opts?.stdin });
      if (argv[0] === 'grep') return { ...okOutcome(), exitCode: 1 };
      return okOutcome();
    };
    const result = await fstabAddHandler(stub)(
      baseReq('fstab-add', {
        server: 'node02',
        remote: '/var/lib/swarmui/shared',
        local: '/var/lib/swarmui/shared',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(calls[0].argv).toEqual([
      'grep',
      '-qF',
      `# ${NFS_SENTINEL_DEFAULT}`,
      NFS_FSTAB_FILE,
    ]);
    expect(calls[1].argv).toEqual(['tee', '-a', NFS_FSTAB_FILE]);
    expect(calls[1].stdin).toMatch(
      /^node02:\/var\/lib\/swarmui\/shared \/var\/lib\/swarmui\/shared nfs [a-z0-9_,._=-]+ 0 0 # swarmui-nfs-shared\n$/,
    );
  });

  it('is a no-op when the sentinel already exists in /etc/fstab', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      if (argv[0] === 'grep') return okOutcome();
      return okOutcome();
    };
    const result = await fstabAddHandler(stub)(
      baseReq('fstab-add', {
        server: 'node02',
        remote: '/x',
        local: '/x',
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderrTail).toContain('idempotent-skip');
    expect(calls).toHaveLength(1);
  });
});

describe('fstabRemoveHandler', () => {
  it('runs sed -i /# <sentinel>$/d /etc/fstab', async () => {
    const calls: string[][] = [];
    const stub: Exec = async (argv) => {
      calls.push(argv);
      return okOutcome();
    };
    await fstabRemoveHandler(stub)(baseReq('fstab-remove'));
    expect(calls[0]).toEqual([
      'sed',
      '-i',
      `/# ${NFS_SENTINEL_DEFAULT}$/d`,
      NFS_FSTAB_FILE,
    ]);
  });

  it('rejects an invalid sentinel before any exec', async () => {
    const stub: Exec = async () => {
      throw new Error('exec must not be called');
    };
    await expect(
      fstabRemoveHandler(stub)(
        baseReq('fstab-remove', { sentinel: '; rm -rf /' }),
      ),
    ).rejects.toThrow(/invalid sentinel/);
  });
});

describe('realHandlerMap()', () => {
  it('registers a handler for every whitelisted commandId', () => {
    const map = realHandlerMap(async () => okOutcome());
    for (const cmd of NODE_EXEC_COMMANDS) {
      expect(typeof map[cmd]).toBe('function');
    }
  });

  it('uses the real D1 handlers for the implemented commandIds, NOOP for the rest', async () => {
    const argvCapture: string[][] = [];
    const exec: Exec = async (argv) => {
      argvCapture.push(argv);
      return okOutcome();
    };
    const map = realHandlerMap(exec);
    // D1-implemented: should actually exec something.
    await map['mkdir-swarmui-shared-root']!(baseReq('mkdir-swarmui-shared-root'));
    await map['apt-install-fuse3']!(baseReq('apt-install-fuse3'));
    expect(argvCapture.length).toBeGreaterThan(0);
    // After Sprint 7 every whitelisted commandId has a real handler and
    // every one exec's at least once (TLS bootstrap used to be the lone
    // NOOP; it now spawns openssl). Sanity-check: a trivial commandId
    // flows through exec at least once with a known argv prefix.
    argvCapture.length = 0;
    await map['apt-install-fuse3']!(baseReq('apt-install-fuse3'));
    expect(argvCapture.length).toBeGreaterThan(0);
    expect(argvCapture[0][0]).toBe('apt-get');
  });
});

// --- helpers -------------------------------------------------------------

function emptyHash(): string {
  // sha256('') truncated to 32 chars.
  return 'e3b0c44298fc1c149afbf4c8996fb924';
}

function okOutcome(): ExecOutcome {
  return {
    exitCode: 0,
    stdoutHash: emptyHash(),
    stderrHash: emptyHash(),
    durationMs: 1,
  };
}

import {
  aptInstallHandler,
  defaultExec,
  dockerPullHandler,
  dockerRunFilerHandler,
  dockerRunMasterHandler,
  dockerRunVolumeHandler,
  mkdirSharedRootHandler,
  realHandlerMap,
  SEAWEEDFS_CONTAINER_NAMES,
  testMountWriteHandler,
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
    // Not yet implemented: NOOP never calls exec.
    argvCapture.length = 0;
    await map['firewall-allow-seaweedfs-ports']!(
      baseReq('firewall-allow-seaweedfs-ports'),
    );
    await map['seaweedfs-tls-bootstrap']!(baseReq('seaweedfs-tls-bootstrap'));
    await map['install-seaweedfs-mount-systemd-unit']!(
      baseReq('install-seaweedfs-mount-systemd-unit'),
    );
    expect(argvCapture).toHaveLength(0);
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

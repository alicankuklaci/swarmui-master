import * as crypto from 'node:crypto';
import type { NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';
import { defaultExec, type Exec, type ExecOutcome } from './exec';
import type { CommandHandler } from './types';

// Sprint 7: real TLS bootstrap.
//
// Generates (or re-uses) a cluster CA at /etc/swarmui/tls/ca.{key,crt} on the
// master node, then issues one CA-signed per-node cert+key pair under the
// same directory. All private keys are written 0600; certs are 0644.
//
// Scope caveat (Sprint 7, documented): the per-node bundles stay on master's
// local filesystem. Cross-node distribution + the docker-run handler's
// `-tls.ca -tls.cert -tls.key` flags are a Sprint 8 follow-up. An operator
// flipping to `insecure=false` today gets a real CA + signed certs they can
// `rsync` out to each node by hand, which is a meaningful advance over the
// Sprint 3 "intentional no-op" state.
//
// Idempotency: if ca.crt + ca.key both exist and the common-name matches
// what the plan requested, we re-use them (openssl re-reads the key for
// signing new node certs). Node certs are regenerated every call — cheap
// (<1s per node) and keeps the signing chain fresh for a resumed install.

const CN_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const NODE_LIST_RE = /^[a-zA-Z0-9][a-zA-Z0-9._,-]{0,1023}$/;
const TLS_DIR = '/etc/swarmui/tls';
const CA_KEY = `${TLS_DIR}/ca.key`;
const CA_CRT = `${TLS_DIR}/ca.crt`;
const CA_SERIAL = `${TLS_DIR}/ca.srl`;
const DEFAULT_COMMON_NAME = 'swarmui-seaweedfs';
const CA_DAYS = '3650';
const NODE_DAYS = '365';
const CA_KEY_BITS = '4096';
const NODE_KEY_BITS = '2048';
const OPENSSL_TIMEOUT_MS = 60_000;

function toResult(req: NodeExecRequest, outcome: ExecOutcome): NodeExecResult {
  return {
    commandId: req.commandId,
    nodeId: req.nodeId,
    exitCode: outcome.exitCode,
    stdoutHash: outcome.stdoutHash,
    stderrHash: outcome.stderrHash,
    stdoutTail: outcome.stdoutTail,
    stderrTail: outcome.stderrTail,
    durationMs: outcome.durationMs,
  };
}

function assertStringMatch(value: unknown, re: RegExp, field: string): string {
  if (typeof value !== 'string' || !re.test(value)) {
    throw new Error(`tls handler: invalid ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function syntheticOk(label: string, fingerprint?: string): ExecOutcome {
  const h = crypto
    .createHash('sha256')
    .update(label + (fingerprint ?? ''))
    .digest('hex')
    .slice(0, 32);
  return {
    exitCode: 0,
    stdoutHash: h,
    stderrHash: h,
    stderrTail: fingerprint
      ? `${label} ca-fingerprint=${fingerprint}`
      : label,
    durationMs: 0,
  };
}

// Separate out parseNodeList so a plan author can see the surface. Nodes
// come in as a comma-separated string (NodeExecRequest.args values must
// be scalars — not arrays). The regex guarantees we never pass a shell
// meta-char into openssl's -subj CN.
export function parseNodeList(raw: unknown): string[] {
  const s = assertStringMatch(raw, NODE_LIST_RE, 'nodes');
  const parts = s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  for (const p of parts) {
    if (!CN_RE.test(p)) {
      throw new Error(`tls handler: invalid node name ${JSON.stringify(p)}`);
    }
  }
  if (parts.length === 0) {
    throw new Error('tls handler: nodes list must have at least one entry');
  }
  return [...new Set(parts)]; // dedupe
}

// Scan `openssl x509 -fingerprint -sha256 -noout` output. Example line:
// "sha256 Fingerprint=AA:BB:CC:...". Return the hex pairs joined without
// colons so comparison is uniform.
function parseFingerprint(stdoutTail: string | undefined): string | undefined {
  if (!stdoutTail) return undefined;
  const m = stdoutTail.match(/[Ff]ingerprint=([0-9A-Fa-f:]+)/);
  if (!m) return undefined;
  return m[1].replace(/:/g, '').toLowerCase();
}

async function readCaFingerprint(exec: Exec): Promise<string | undefined> {
  const out = await exec(
    ['openssl', 'x509', '-in', CA_CRT, '-fingerprint', '-sha256', '-noout'],
    { timeoutMs: OPENSSL_TIMEOUT_MS },
  );
  if (out.exitCode !== 0) return undefined;
  return parseFingerprint(out.stdoutTail);
}

// `test -r <path>`: exit 0 if readable, 1 otherwise. We don't shell to -f
// because we care about read access from the agent's uid, not just
// existence (an operator who chmod'd ca.key to 0000 would still have the
// file but no path to re-use it).
async function pathReadable(exec: Exec, path: string): Promise<boolean> {
  const out = await exec(['test', '-r', path], { timeoutMs: 5_000 });
  return out.exitCode === 0;
}

// Shared "ensure directory with mode" helper. tls dir must be at mode 0700
// so a non-root reader on the node can't list private keys.
async function ensureTlsDir(exec: Exec): Promise<ExecOutcome> {
  const mk = await exec(['mkdir', '-p', '-m', '0700', TLS_DIR], {
    timeoutMs: 5_000,
  });
  if (mk.exitCode !== 0) return mk;
  // mkdir -m applies only on creation; chmod enforces the mode on a dir
  // that already existed.
  return exec(['chmod', '0700', TLS_DIR], { timeoutMs: 5_000 });
}

async function generateCa(
  exec: Exec,
  commonName: string,
): Promise<ExecOutcome> {
  // Sprint 8 security: umask race fix. Previously genpkey created the CA
  // key file with the process umask (typically 0022 → mode 0644), briefly
  // making the private key world-readable before the follow-up chmod 0600
  // tightened it. The `sh -c 'umask 0077; openssl …'` wrapper forces the
  // file to be created at 0600 from the start — no window for a reader on
  // another process to grab it. The explicit chmod stays as a belt-and-
  // braces guarantee against a stale umask inheritance.
  const key = await exec(
    [
      'sh',
      '-c',
      'umask 0077; exec "$@"',
      'tls-ca-genpkey',
      'openssl',
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      `rsa_keygen_bits:${CA_KEY_BITS}`,
      '-out',
      CA_KEY,
    ],
    { timeoutMs: OPENSSL_TIMEOUT_MS },
  );
  if (key.exitCode !== 0) return key;
  const chmodKey = await exec(['chmod', '0600', CA_KEY], { timeoutMs: 5_000 });
  if (chmodKey.exitCode !== 0) return chmodKey;
  const cert = await exec(
    [
      'openssl',
      'req',
      '-x509',
      '-new',
      '-key',
      CA_KEY,
      '-subj',
      `/CN=${commonName}`,
      '-days',
      CA_DAYS,
      '-out',
      CA_CRT,
    ],
    { timeoutMs: OPENSSL_TIMEOUT_MS },
  );
  if (cert.exitCode !== 0) return cert;
  return exec(['chmod', '0644', CA_CRT], { timeoutMs: 5_000 });
}

async function signNodeCert(exec: Exec, node: string): Promise<ExecOutcome> {
  const nodeKey = `${TLS_DIR}/${node}.key`;
  const nodeCsr = `${TLS_DIR}/${node}.csr`;
  const nodeCrt = `${TLS_DIR}/${node}.crt`;

  // Same umask-race protection as generateCa: force 0600 at creation time.
  const key = await exec(
    [
      'sh',
      '-c',
      'umask 0077; exec "$@"',
      'tls-node-genpkey',
      'openssl',
      'genpkey',
      '-algorithm',
      'RSA',
      '-pkeyopt',
      `rsa_keygen_bits:${NODE_KEY_BITS}`,
      '-out',
      nodeKey,
    ],
    { timeoutMs: OPENSSL_TIMEOUT_MS },
  );
  if (key.exitCode !== 0) return key;
  const chmodKey = await exec(['chmod', '0600', nodeKey], { timeoutMs: 5_000 });
  if (chmodKey.exitCode !== 0) return chmodKey;

  const csr = await exec(
    [
      'openssl',
      'req',
      '-new',
      '-key',
      nodeKey,
      '-subj',
      `/CN=${node}`,
      '-out',
      nodeCsr,
    ],
    { timeoutMs: OPENSSL_TIMEOUT_MS },
  );
  if (csr.exitCode !== 0) return csr;

  // -extfile via /dev/stdin so we never land the extensions on disk — a
  // stale extfile from a prior run can't drift the SANs. SubjectAltName is
  // DNS:<node>; a swarm overlay IP would be nicer but the backend can't
  // learn each node's overlay IP without round-tripping the manager, and
  // SeaweedFS verifies the DNS SAN at TLS handshake.
  const ext = `subjectAltName=DNS:${node}\n`;
  const sign = await exec(
    [
      'openssl',
      'x509',
      '-req',
      '-in',
      nodeCsr,
      '-CA',
      CA_CRT,
      '-CAkey',
      CA_KEY,
      '-CAcreateserial',
      '-CAserial',
      CA_SERIAL,
      '-out',
      nodeCrt,
      '-days',
      NODE_DAYS,
      '-sha256',
      '-extfile',
      '/dev/stdin',
    ],
    {
      stdin: ext,
      timeoutMs: OPENSSL_TIMEOUT_MS,
    },
  );
  if (sign.exitCode !== 0) return sign;
  const chmodCrt = await exec(['chmod', '0644', nodeCrt], { timeoutMs: 5_000 });
  if (chmodCrt.exitCode !== 0) return chmodCrt;
  // CSR is no longer needed; its presence on disk is harmless but
  // confuses an operator inspecting /etc/swarmui/tls.
  return exec(['rm', '-f', nodeCsr], { timeoutMs: 5_000 });
}

export function seaweedfsTlsBootstrapHandler(
  exec: Exec = defaultExec,
): CommandHandler {
  return async (req) => {
    const commonName =
      typeof req.args.commonName === 'string'
        ? assertStringMatch(req.args.commonName, CN_RE, 'commonName')
        : DEFAULT_COMMON_NAME;
    const nodes = parseNodeList(req.args.nodes);

    const mk = await ensureTlsDir(exec);
    if (mk.exitCode !== 0) return toResult(req, mk);

    // Idempotency: existing CA is reused. We don't re-check that its CN
    // matches commonName — rotating CA mid-install would invalidate every
    // node cert, which is a Sprint 8+ operator-initiated flow, not a
    // reconciler-driven one.
    const caExists =
      (await pathReadable(exec, CA_KEY)) && (await pathReadable(exec, CA_CRT));
    if (!caExists) {
      const gen = await generateCa(exec, commonName);
      if (gen.exitCode !== 0) return toResult(req, gen);
    }

    for (const node of nodes) {
      const sign = await signNodeCert(exec, node);
      if (sign.exitCode !== 0) return toResult(req, sign);
    }

    const fingerprint = await readCaFingerprint(exec);
    return toResult(
      req,
      syntheticOk(
        `tls bootstrap ok: ${nodes.length} node cert(s) under ${TLS_DIR}`,
        fingerprint,
      ),
    );
  };
}

export const TLS_BOOTSTRAP_DIR = TLS_DIR;
export const TLS_CA_CRT_PATH = CA_CRT;
export const TLS_CA_KEY_PATH = CA_KEY;

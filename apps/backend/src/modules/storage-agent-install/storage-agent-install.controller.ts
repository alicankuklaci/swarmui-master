import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { InstallTokenStore } from './install-token.store';
import { InstallTokenGuard } from './install-token.guard';
import { AgentProbeService, AgentProbeResult } from './agent-probe.service';

// Hostname regex kept inline to avoid a cross-module import from
// install-storage.dto — this controller is loaded even when the storage
// feature flag is off, and we don't want to pull a flag-gated DTO file.
const NODE_NAME_RE_LOCAL = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Operator setup endpoints for the shared-storage swarm-agent.
//
//   POST /install-token           admin-only: generates { secret, token,
//                                 installCommand, backendEnv } with 15 min
//                                 TTL. Secret is shown ONCE; operator pastes
//                                 the command on each swarm node and adds
//                                 backendEnv lines to stack.yml.
//   GET  /install.sh?t=<token>    bash installer, token-gated.
//   GET  /bundle.tgz?t=<token>    tar of dist + node_modules, token-gated.
//
// The install endpoints are deliberately not JWT-authenticated — the host
// running `curl ... | sudo bash` has no bearer. The opaque short-TTL token
// in ?t= is the auth boundary; a reader with no token gets a 401.
//
// FEATURE_SHARED_STORAGE independence: this module is always loaded in
// AppModule because operators must install agents BEFORE flipping the
// shared-storage feature flag.

const BUNDLE_RELATIVE_PATHS = [
  // Dev: ts-node from apps/backend/src/modules/storage-agent-install
  path.join(__dirname, '..', '..', '..', '..', 'assets', 'agent-bundle.tgz'),
  // Prod image: compiled JS lives under apps/backend/dist/..., asset
  // placed alongside at apps/backend/assets/agent-bundle.tgz (Dockerfile
  // copies both).
  path.join(__dirname, '..', '..', '..', 'assets', 'agent-bundle.tgz'),
];

function resolveBundlePath(): string | undefined {
  for (const candidate of BUNDLE_RELATIVE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveBaseUrl(req: Request): string {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : (protoHeader ?? req.protocol);
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers['host'];
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) throw new Error('cannot resolve base URL (no Host header)');
  return `${proto}://${host}`;
}

function renderInstallScript(bundleUrl: string): string {
  return `#!/usr/bin/env bash
# SwarmUI shared-storage agent installer.
# Run as root on every swarm node:
#   curl -fsSL '<install-url>' | sudo AGENT_HMAC_SECRET='<32+ bytes>' bash
#
# Idempotent: re-running updates /opt/swarmui-shared-storage-agent and
# restarts the service.
set -euo pipefail

AGENT_DIR=/opt/swarmui-shared-storage-agent
AGENT_ENV=/etc/swarmui/agent.env
UNIT_FILE=/etc/systemd/system/swarmui-shared-storage-agent.service
BUNDLE_URL='${bundleUrl}'

if [ "\${EUID:-$(id -u)}" -ne 0 ]; then
  echo "install.sh: must run as root (prefix with sudo)" >&2
  exit 1
fi
if [ -z "\${AGENT_HMAC_SECRET:-}" ] || [ "\${#AGENT_HMAC_SECRET}" -lt 32 ]; then
  echo "install.sh: AGENT_HMAC_SECRET must be set and >= 32 chars" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "install.sh: node 20+ required on PATH. On Debian/Ubuntu:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs" >&2
  exit 3
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "install.sh: curl is required" >&2
  exit 3
fi

echo "==> fetching bundle"
TMPTAR="$(mktemp /tmp/swarmui-agent.XXXXXX.tgz)"
cleanup() { rm -f "$TMPTAR"; }
trap cleanup EXIT
curl -fsSL "$BUNDLE_URL" -o "$TMPTAR"

echo "==> extracting into $AGENT_DIR"
mkdir -p "$AGENT_DIR"
tar -xzf "$TMPTAR" -C "$AGENT_DIR" --strip-components=1

echo "==> writing $AGENT_ENV (0600)"
mkdir -p "$(dirname "$AGENT_ENV")"
umask 0177
printf 'AGENT_HMAC_SECRET=%s\\n' "$AGENT_HMAC_SECRET" > "$AGENT_ENV"
umask 0022
chown root:root "$AGENT_ENV"
chmod 0600 "$AGENT_ENV"

echo "==> writing $UNIT_FILE"
cat > "$UNIT_FILE" <<'UNIT'
[Unit]
Description=SwarmUI shared-storage node-exec agent (HMAC-signed WebSocket)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
NoNewPrivileges=true
EnvironmentFile=/etc/swarmui/agent.env
Environment=AGENT_PORT=9443
Environment=AGENT_HOST=0.0.0.0
Environment=NODE_ENV=production
Environment=AGENT_WS_INSECURE=true
Environment=AGENT_WS_INSECURE_IN_PROD=true
ExecStart=/usr/bin/node /opt/swarmui-shared-storage-agent/dist/bin.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=swarmui-shared-storage-agent

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$UNIT_FILE"

if command -v ufw >/dev/null 2>&1; then
  ufw allow 9443/tcp >/dev/null 2>&1 || true
fi

echo "==> reload + restart"
systemctl daemon-reload
systemctl enable --now swarmui-shared-storage-agent.service

sleep 1
systemctl --no-pager --full status swarmui-shared-storage-agent.service | head -15 || true
echo
echo "swarmui-shared-storage-agent listening on tcp/9443"
echo "logs: journalctl -u swarmui-shared-storage-agent -f"
`;
}

export interface IssueInstallTokenResponse {
  // The one-liner the operator pastes on each swarm node. Already includes
  // the token in ?t= and the generated secret in AGENT_HMAC_SECRET.
  installCommand: string;
  // Lines to add to stack.yml so the backend's node-exec client signs with
  // the same HMAC. After this is in place, the operator flips
  // FEATURE_SHARED_STORAGE=true and restarts the backend.
  backendEnv: string[];
  // When the install endpoints stop accepting the token.
  expiresAt: string;
  // Max per-token install count (one per node is enough; limit is generous).
  installsRemaining: number;
}

@ApiTags('Storage Agent Install')
@Controller({ path: 'storage/agent', version: '1' })
export class StorageAgentInstallController {
  private readonly logger = new Logger(StorageAgentInstallController.name);

  constructor(
    private readonly tokens: InstallTokenStore,
    private readonly probe: AgentProbeService,
  ) {}

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Get('swarm-nodes')
  @ApiOperation({
    summary:
      'List hostnames of every node in the local Docker Swarm. Pre-fills the install wizard so operators do not type node names by hand.',
  })
  async swarmNodes(): Promise<{
    nodes: Array<{ nodeId: string; role: string; availability: string }>;
  }> {
    const nodes = await this.probe.listSwarmNodes();
    return { nodes };
  }

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Post('ping-nodes')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'TCP probe port 9443 on each listed node. Returns per-node up/down + latency; the install wizard poll loop uses this to show when the operator has finished pasting the installer on every node.',
  })
  async pingNodes(
    @Body() body: { nodes?: unknown },
  ): Promise<{ results: AgentProbeResult[]; allUp: boolean }> {
    const raw = body?.nodes;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('nodes[] required');
    }
    if (raw.length > 64) {
      throw new BadRequestException('nodes[] max length is 64');
    }
    const nodeIds: string[] = [];
    for (const n of raw) {
      if (typeof n !== 'string' || !NODE_NAME_RE_LOCAL.test(n)) {
        throw new BadRequestException(
          `nodes[]: ${JSON.stringify(n)} is not a valid RFC-1123 hostname`,
        );
      }
      nodeIds.push(n);
    }
    const results = await this.probe.probeMany(nodeIds);
    return { results, allUp: results.every((r) => r.up) };
  }

  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  @Post('install-token')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Generate a 15-min install token + HMAC secret for the shared-storage swarm-agent. Returns the one-liner to run on each node.',
  })
  issueInstallToken(
    @Req() req: Request,
    @CurrentUser() user: { id: string; role: string },
  ): IssueInstallTokenResponse {
    const issued = this.tokens.issue(user.id);
    const baseUrl = resolveBaseUrl(req);
    const installUrl = `${baseUrl}/api/v1/storage/agent/install.sh?t=${issued.token}`;
    const installCommand = `curl -fsSL '${installUrl}' | sudo AGENT_HMAC_SECRET='${issued.secret}' bash`;
    this.logger.log(
      `install-token endpoint: admin=${user.id} base=${baseUrl} expires=${issued.expiresAt.toISOString()}`,
    );
    return {
      installCommand,
      backendEnv: [
        `AGENT_HMAC_SECRET=${issued.secret}`,
        'FEATURE_SHARED_STORAGE=true',
        'AGENT_WS_URL_TEMPLATE=ws://{nodeId}:9443/node-exec',
        'AGENT_WS_INSECURE=true',
        'AGENT_WS_INSECURE_IN_PROD=true',
      ],
      expiresAt: issued.expiresAt.toISOString(),
      installsRemaining: 32,
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard, InstallTokenGuard)
  @Throttle({ default: { limit: 32, ttl: 60_000 } })
  @Get('install.sh')
  @Header('Content-Type', 'text/x-shellscript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Token-gated: returns the bash installer. Pipe into `sudo AGENT_HMAC_SECRET=... bash`.',
  })
  installScript(@Req() req: Request): string {
    const baseUrl = resolveBaseUrl(req);
    const token = (req.query?.t as string) ?? '';
    const bundleUrl = `${baseUrl}/api/v1/storage/agent/bundle.tgz?t=${encodeURIComponent(token)}`;
    this.logger.log(`install.sh served to ${req.ip}`);
    return renderInstallScript(bundleUrl);
  }

  @Public()
  @UseGuards(ThrottlerGuard, InstallTokenGuard)
  @Throttle({ default: { limit: 32, ttl: 60_000 } })
  @Get('bundle.tgz')
  @Header('Content-Type', 'application/gzip')
  @Header('Content-Disposition', 'attachment; filename="swarmui-agent-bundle.tgz"')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Token-gated: pre-built swarm-agent tarball consumed by install.sh.',
  })
  bundle(@Res() res: Response): void {
    const bundlePath = resolveBundlePath();
    if (!bundlePath) {
      this.logger.error(
        `bundle.tgz: asset not found; searched ${BUNDLE_RELATIVE_PATHS.join(', ')}`,
      );
      throw new NotFoundException('agent bundle asset not present in image');
    }
    const stat = fs.statSync(bundlePath);
    res.setHeader('Content-Length', String(stat.size));
    const stream = fs.createReadStream(bundlePath);
    stream.pipe(res);
    stream.on('error', (err) => {
      this.logger.error(`bundle.tgz: read error ${err}`);
      res.destroy(err);
    });
  }
}

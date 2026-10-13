#!/usr/bin/env node
// Entry point for the shared-storage swarm-agent systemd service. Reads
// AGENT_* env, boots startAgent() with the real handler map, and keeps the
// process alive. All command execution — docker, systemctl, apt, mkdir —
// runs on the host because this binary runs as a systemd service on the
// host, not inside a container.

import { startAgent } from './server';
import { realHandlerMap } from './handlers/real-map';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    process.stderr.write(`swarmui-agent: ${name} is required\n`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const hmacSecret = requireEnv('AGENT_HMAC_SECRET');
  if (hmacSecret.length < 32) {
    process.stderr.write('swarmui-agent: AGENT_HMAC_SECRET must be >= 32 chars\n');
    process.exit(2);
  }
  const port = Number(process.env.AGENT_PORT ?? '9443');
  const host = process.env.AGENT_HOST ?? '0.0.0.0';
  const path = process.env.AGENT_PATH ?? '/node-exec';
  const maxPayloadBytes = process.env.AGENT_MAX_PAYLOAD_BYTES
    ? Number(process.env.AGENT_MAX_PAYLOAD_BYTES)
    : undefined;

  const handle = await startAgent({
    hmacSecret,
    port,
    host,
    path,
    handlers: realHandlerMap(),
    maxPayloadBytes,
    onAudit: (entry) => {
      // One JSON line per audited request, straight to stdout — journald
      // picks it up and we grep without touching a logfile.
      process.stdout.write(JSON.stringify(entry) + '\n');
    },
  });

  process.stdout.write(
    JSON.stringify({
      event: 'swarmui-agent.listening',
      host,
      port: handle.port,
      path,
    }) + '\n',
  );

  // Graceful shutdown so systemd's SIGTERM doesn't orphan a dispatch mid-flight.
  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(
      JSON.stringify({ event: 'swarmui-agent.shutdown', signal }) + '\n',
    );
    try {
      await handle.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(
    `swarmui-agent: fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});

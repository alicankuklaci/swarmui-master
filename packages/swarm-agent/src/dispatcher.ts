import * as crypto from 'node:crypto';
import {
  NODE_EXEC_COMMANDS,
  type NodeExecCommandId,
  type NodeExecRequest,
  type NodeExecResult,
} from '@swarmui-master/storage-plan';
import type { CommandHandler, HandlerMap } from './handlers/types';

// Dispatches a verified request to the matching handler. The whitelist is the
// one source of truth: both the backend's plan generator (storage-core) and
// this dispatcher import NODE_EXEC_COMMANDS from storage-plan, so a step with
// an unknown commandId never reaches a handler.
//
// Missing handler → exitCode=127 (classic "command not found" code). This
// lets the operator distinguish "the agent doesn't know this command yet"
// from "the handler ran and failed."

const UNKNOWN_COMMAND = 127;

function sha256Trunc(buf: string | Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
}

export const NOOP_HANDLER: CommandHandler = (req) => ({
  commandId: req.commandId,
  nodeId: req.nodeId,
  exitCode: 0,
  stdoutHash: sha256Trunc(`noop:${req.commandId}:${req.nodeId}`),
  stderrHash: sha256Trunc(''),
  durationMs: 0,
});

// Default: every whitelisted command maps to NOOP_HANDLER. Sprint 3 replaces
// entries one by one as the real installers ship.
export function defaultHandlerMap(): HandlerMap {
  const map: HandlerMap = {};
  for (const cmd of NODE_EXEC_COMMANDS) {
    map[cmd] = NOOP_HANDLER;
  }
  return map;
}

export async function dispatch(
  request: NodeExecRequest,
  handlers: HandlerMap,
): Promise<NodeExecResult> {
  const cmd = request.commandId as NodeExecCommandId;
  // Reject anything not in the whitelist. The agent trusts its own copy of
  // the whitelist, not the request body — a rogue backend can't invent new
  // commands.
  if (!(NODE_EXEC_COMMANDS as readonly string[]).includes(cmd)) {
    return {
      commandId: cmd,
      nodeId: request.nodeId,
      exitCode: UNKNOWN_COMMAND,
      stdoutHash: sha256Trunc(''),
      stderrHash: sha256Trunc(`unknown commandId: ${cmd}`),
      stderrTail: `unknown commandId: ${cmd}`,
      durationMs: 0,
    };
  }
  const handler = handlers[cmd];
  if (!handler) {
    return {
      commandId: cmd,
      nodeId: request.nodeId,
      exitCode: UNKNOWN_COMMAND,
      stdoutHash: sha256Trunc(''),
      stderrHash: sha256Trunc(`no handler for ${cmd}`),
      stderrTail: `no handler installed for ${cmd}`,
      durationMs: 0,
    };
  }
  const start = Date.now();
  try {
    const result = await handler(request);
    // Overwrite durationMs if the handler forgot to set one.
    if (!result.durationMs) result.durationMs = Date.now() - start;
    return result;
  } catch (err) {
    const message = (err as Error).message ?? 'handler threw';
    return {
      commandId: cmd,
      nodeId: request.nodeId,
      exitCode: 1,
      stdoutHash: sha256Trunc(''),
      stderrHash: sha256Trunc(message),
      stderrTail: message.slice(0, 2048),
      durationMs: Date.now() - start,
    };
  }
}

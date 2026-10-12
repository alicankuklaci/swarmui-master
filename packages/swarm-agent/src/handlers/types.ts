import type { NodeExecCommandId, NodeExecRequest, NodeExecResult } from '@swarmui-master/storage-plan';

// Each command handler receives the signed+verified request and returns a
// NodeExecResult. Handlers run on the node where the agent lives, so they
// can touch the local filesystem, systemd, docker CLI, etc.
//
// Sprint 2 ships stubs that return exitCode=0 for every whitelisted command
// — the integration test exercises the orchestrator ↔ agent path end to end
// without yet calling out to apt/docker. Real handlers land in Sprint 3+ as
// each driver step is implemented.
export type CommandHandler = (
  request: NodeExecRequest,
) => NodeExecResult | Promise<NodeExecResult>;

export type HandlerMap = Partial<Record<NodeExecCommandId, CommandHandler>>;

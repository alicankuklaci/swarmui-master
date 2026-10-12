# SwarmUI — Shared Storage Module (Design Plan v2)

**Status:** architect-approved, pre-implementation
**Date:** 2026-10-11
**Trigger:** 2026-10-11 incident — Docker Swarm rescheduled mongo from node03 (where its 381MB local volume lived) to node02; backend saw an empty DB. 90 min of manual recovery (pin + rebind) before data returned.

## Problem

Docker Swarm's default `local` volume driver pins data to the node that first created it. Any reschedule to another node starts the service against a fresh empty volume, which is indistinguishable from data loss until an operator debugs it. SwarmUI currently has no first-class way to prevent this.

## Goal

One-click **"Setup Shared Storage"** inside SwarmUI that installs a replicated cluster filesystem across swarm nodes, exposes it as a bind-mount source available on every node, and surfaces its health. Stateful services survive reschedule because the data lives everywhere.

## Non-goals (v1)

- No automatic migration of existing local-volume data onto the shared FS (manual migration guide shipped alongside).
- No backup/snapshot UI — orthogonal module.
- No support for cloud-managed volumes (CSI) in v1; schema reserves a `driver` field for v2.

## Primary backend: **SeaweedFS**

Chosen over GlusterFS (upstream in maintenance since 2024), MooseFS CE (single-master metadata is not HA under the free license), Longhorn (Kubernetes-only), Garage (S3 only, no POSIX for Postgres), and Rook/Ceph (K8s + operator expertise we explicitly don't have).

SeaweedFS wins because it:
- Ships as a single Go binary **and** an official Docker image → agent host surface stays minimal
- Native replication (`replication=010` survives one node failure on a 3+ node cluster)
- FUSE mount that bind-mounts cleanly into Swarm services via `/var/lib/swarmui/shared/<name>`
- Small-file performance fits Mongo/Postgres WAL/Redis AOF without the tuning Ceph demands

**Secondary "simple mode":** NFS — single-server, SPOF, explicitly labelled as non-HA in the wizard. For users on 1-2 nodes or who want zero cluster coordination.

## UX / Flow

Entry: **Volumes page → "Shared Storage" tab → "Set up" button** (admin-only, `storage:admin` permission).

Wizard:
1. **Backend choice** — SeaweedFS (recommended, HA) or NFS (simple, SPOF).
2. **Nodes** — all swarm nodes checked by default; user can exclude any.
3. **Config** — mount point fixed to `/var/lib/swarmui/shared`, replication count (SeaweedFS, default `010` = 1 replica same rack / 0 across data centers / 0 same disk).
4. **Review** — plain-language diff per node (packages installed, systemd units added, ports opened).
5. **Install** — SSE progress stream, step-by-step per node.
6. **Done** — health card + "Use in your stack" code snippet (`type: bind, source: /var/lib/swarmui/shared/<name>, target: /data/db`).

After install, `/var/lib/swarmui/shared/<name>` is available on every node; stateful services can bind-mount it directly, no changes to how stacks are deployed.

## Architecture

### Strategy pattern: `storage-core` + `storage-driver-{seaweedfs,nfs}`

Modeled on NestJS modules + a shared package so the two drivers never share state.

```
apps/backend/src/modules/storage/
  storage-core.module.ts           # state machine, audit, RBAC, node-exec client
  state-machine.ts                 # 9-state FSM + persistence
  node-exec.client.ts              # HMAC-signed call to agent
  audit.service.ts                 # Mongo + file-mirror
  controllers/
    shared-storage.controller.ts   # /status, /install, /uninstall, /health, /audit
  drivers/
    seaweedfs/
      installer.ts                 # plan generator
      healthcheck.ts
      driver.module.ts
    nfs/
      installer.ts
      healthcheck.ts
      driver.module.ts
  schemas/
    shared-storage.schema.ts       # { backend, driver, nodes[], mountPoint, state, ... }
    storage-audit.schema.ts
```

Shared package `packages/storage-plan/` exports the install-plan schema; both the backend and the swarm-agent import it and validate against the same TypeScript types. Avoids whitelist drift.

### State machine (9 states)

```
PENDING
   │
   ▼
INSTALLING ──(fail)──▶ UNINSTALL_FAILED  (manual recovery required)
   │                        ▲
   ▼                        │
HEALTHY ◀───────────────────┤
   │                        │
   ├─(brick drop)──▶ DEGRADED ──▶ RECOVERING ──▶ HEALTHY
   │
   ├─(adopt existing)──▶ ADOPTING ──▶ HEALTHY
   │
   └─(uninstall)──▶ DRAINING ──▶ UNINSTALLED
                     │
                     └─(fail)──▶ UNINSTALL_FAILED
```

Each transition persisted; backend restart resumes mid-step via a `lastAttemptedStepId`.

### Agent `/node-exec`

The agent gaining node-level shell is the module's largest security surface. Hardening:

1. **Hard-coded commandId whitelist** — v1 for SeaweedFS:
   ```
   mkdir-swarmui-shared-root
   apt-install-fuse3
   docker-pull-seaweedfs
   docker-run-seaweedfs-master
   docker-run-seaweedfs-volume
   docker-run-seaweedfs-filer
   install-seaweedfs-mount-systemd-unit
   systemctl-enable-seaweedfs-mount
   firewall-allow-seaweedfs-ports        # 9333, 8080, 8888, 18080
   seaweedfs-cluster-healthcheck
   seaweedfs-tls-bootstrap               # self-signed CA + per-node leaf certs
   ```
   And for NFS: `apt-install-nfs-common`, `apt-install-nfs-kernel-server`, `systemctl-enable-nfs-server`, `nfs-export-add`, `mount-nfs`, `fstab-add`.
   The agent decodes `commandId` + typed args; it **never** receives a shell string.
2. **Per-arg validators** — each commandId has typed args with validators (path regex `^/var/lib/swarmui/shared/[a-z0-9_-]+$`, hostname whitelist from the swarm's actual node list, port in `[1024, 65535]`).
3. **HMAC-bound request** — signature over `(nonce, commandId, argvHash, nodeId, installSessionId, exp=now+5min)`; replay protection on `nonce`.
4. **Dedicated non-root user** — agent runs each commandId via sudoers with the exact argv pattern pinned; whitelist enforced twice (agent code + OS sudoers).
5. **Kill switch** — presence of `/etc/swarmui/node-exec.disabled` on a node makes the agent reject every node-exec call before parsing. Operator can shut down the surface without stopping the agent.
6. **Audit** — every call → `storage_audit_logs` collection in Mongo **and** `/var/lib/swarmui/audit/node-exec.log` on each manager node (file mirror avoids the bootstrap paradox where the audit log would otherwise live only in the Mongo this module exists to protect). Fields: `{ ts, userId, node, commandId, argv, exitCode, stdoutHash, stderrHash }`.

### TLS by default

Self-signed CA generated on the swarm manager during install. Each node gets a leaf cert. gRPC between SeaweedFS components and HTTPS on the filer. Opt-out behind a `--insecure` flag with a loud warning banner in the UI — the historical "we shipped insecure default" incident class is explicitly excluded.

### Pre-install script: `swarmui-node-prepare.sh`

Optional for users who don't want to grant the agent full `apt install` scope. The script installs packages + creates the sudoers file + the dedicated user; after it runs, the module only does *configuration* (no package install). Documented as the "paranoid-admin" path.

## Rollback

Uninstall splits into reversible per-node phases, each idempotent:

```
unmount → fstab clean → systemd unit disable → docker stop/rm sidecars →
    seaweed volume unregister (if gracefully) → firewall rules remove →
    brick wipe (opt-in) → package purge (opt-in)
```

If any phase fails: state goes `UNINSTALL_FAILED` with the exact failing step and a manual-recovery doc link. Uninstall is **refused** if any live stack still bind-mounts `/var/lib/swarmui/shared/*`; the controller enumerates consumers up front and lists them to the user.

## Sprint plan (30 days)

| # | Sprint | Days | Exit criteria | Depends on |
|---|---|---|---|---|
| S1 | **storage-core skeleton** | 4 | 9-state FSM wired, strategy interface, audit file-mirror, `/var/lib/swarmui/shared` convention, unit tests green. No driver yet. | — |
| S2 | **storage-driver-nfs simple mode** | 4 | Non-expert clicks Install, 3-node bind-mount verified, SPOF-on-master-loss documented. | S1 |
| S3 | **storage-driver-seaweedfs core** | 6 | Master/volume/filer provisioned, `replication=010`, FUSE mount, TLS-by-default. Kill-one-node smoke test passes. | S1 |
| S4 | **DRAINING / RECOVERING / UNINSTALL paths** | 4 | Add-node, remove-node, uninstall all green in integration suite. UNINSTALL_FAILED surfaces correctly. | S3 |
| S5 | **ADOPTING + health reconciler** | 3 | Pre-existing SeaweedFS detected and adopted end-to-end, DEGRADED↔RECOVERING visible in UI. | S4 |
| S6 | **🔒 Security review gate (BLOCKING)** | 4 | External sign-off on: TLS cert gen/rotation, command-whitelist argv audit, master-key secret handling, bind-mount path-traversal checks, threat model doc. **No further sprint work merges until signed.** | S3, S4, S5 |
| S7 | **Chaos + DB workload tests** | 3 | Kill-node, network partition, disk-full matrix all recover to HEALTHY. Mongo/Postgres/Redis AOF replay verified on the shared mount. | S6 signed |
| S8 | **UI polish + beta cut** | 2 | One-click install UX, state-aware banners, telemetry opt-in, docs. Beta tag published. | S7 |

**Total:** 30 days. Each sprint ends in a demoable state.

## Rollout gates

- **Feature flag** `features.sharedStorage` default off.
- **Beta** opens only after S6 sign-off; opt-in in Settings; dogfooded on the user's own 3-node swarm for 2 weeks.
- **GA** requires: zero severity-high findings in beta, upgrade test passed (SwarmUI backend upgraded while a Seaweed volume is live), and a documented migration path for the (future) v2 driver swap.

## Related work (blocking)

Both must land before this ships, because they are the same expansion of agent trust:

- **Task #16** — `AGENT_TOKEN` hardcoded in `LogViewer.tsx:46`. Must be fixed so the token the agent accepts is server-rendered, not shipped to every browser.
- **Task #17** — `StacksService` logs full task specs including env vars plaintext. Same hygiene concern; same release train.

## Open items for implementation kick-off

- Pick CI runner for 3-VM Swarm integration tests (self-hosted on an existing swarm vs. an ephemeral multipass setup per PR).
- Decide whether the SeaweedFS master lives on only manager nodes, or on any node (operator-visible choice during install).
- Confirm the AppArmor profile stub for Ubuntu 24.04 that lets the FUSE mount serve container bind-mounts.

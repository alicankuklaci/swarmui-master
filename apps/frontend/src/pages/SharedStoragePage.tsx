import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  HardDrive,
  Loader2,
  PlayCircle,
  ShieldAlert,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api, unwrap } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

// Shared Storage page — single-screen operator UI over the storage-core
// module. Status card, install wizard, live SSE install stream, uninstall
// confirmation with consumer-refuse surface. The backend keeps a singleton
// SharedStorage document; `/storage` returns the current state or null.
//
// Flow:
//   null (no install)        → install wizard
//   PENDING / INSTALLING     → live install stream
//   HEALTHY / DEGRADED       → status card + uninstall button
//   DRAINING                 → live uninstall stream
//   UNINSTALLED              → install wizard again
//   UNINSTALL_FAILED         → status card with "recover" hint
//   ADOPTING / RECOVERING    → status card, read-only
//
// The install SSE stream uses the raw EventSource API (same pattern as
// LogViewer / StatsChart) with a Bearer token on the query string — the
// axios interceptor's Authorization header doesn't reach EventSource, which
// has no `fetch`-style init.

const STATE_STYLES: Record<
  string,
  { label: string; dot: string; text: string; chip: string }
> = {
  PENDING: { label: 'Pending', dot: 'bg-slate-400', text: 'text-slate-600', chip: 'bg-slate-100 text-slate-700' },
  INSTALLING: { label: 'Installing', dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700', chip: 'bg-blue-100 text-blue-700' },
  ADOPTING: { label: 'Adopting', dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-700' },
  HEALTHY: { label: 'Healthy', dot: 'bg-green-500', text: 'text-green-700', chip: 'bg-green-100 text-green-700' },
  DEGRADED: { label: 'Degraded', dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-700' },
  RECOVERING: { label: 'Recovering', dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700', chip: 'bg-blue-100 text-blue-700' },
  DRAINING: { label: 'Draining', dot: 'bg-orange-500 animate-pulse', text: 'text-orange-700', chip: 'bg-orange-100 text-orange-700' },
  UNINSTALLED: { label: 'Uninstalled', dot: 'bg-slate-400', text: 'text-slate-600', chip: 'bg-slate-100 text-slate-700' },
  UNINSTALL_FAILED: { label: 'Uninstall failed', dot: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-100 text-red-700' },
};

type SharedStorageStatus = {
  state: keyof typeof STATE_STYLES;
  backend: 'seaweedfs' | 'nfs';
  nodes: string[];
  mountPoint: string;
  installSessionId?: string;
  // nfsServerNode lives under driverOpts.nfsServerNode when backend=nfs —
  // the schema stashes driver-specific knobs there, not on the top level.
  driverOpts?: Record<string, unknown>;
  lastKnownConsumers?: string[];
  lastConsumerDriftAt?: string;
  lastHealthCheckAt?: string;
  initiatedBy?: string;
};

type InstallStepEvent = {
  sessionId: string;
  phase: 'started' | 'step' | 'done' | 'failed';
  state: string;
  frame: number;
  stepId?: string;
  stepDescription?: string;
  nodeId?: string;
  exitCode?: number;
  durationMs?: number;
  cause?: string;
  ts: string;
};

type AgentInstallBundle = {
  installCommand: string;
  backendEnv: string[];
  expiresAt: string;
  installsRemaining: number;
};

export function SharedStoragePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [installOpen, setInstallOpen] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [refuseError, setRefuseError] = useState<{
    message: string;
    consumers?: string[];
    mountPoint?: string;
  } | null>(null);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [agentBundle, setAgentBundle] = useState<AgentInstallBundle | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [prefilledNodes, setPrefilledNodes] = useState<string[]>([]);

  const statusQuery = useQuery<SharedStorageStatus | null>({
    queryKey: ['shared-storage'],
    queryFn: () => api.get('/storage').then((r) => unwrap(r)),
    // During install/uninstall the SSE stream drives updates; this is just a
    // slow-ticking safety poll so an operator who navigated away and back
    // doesn't see a stale "Installing" after a 3-minute walk.
    refetchInterval: 30_000,
  });

  const status = statusQuery.data;
  const stateStyle = status ? STATE_STYLES[status.state] : null;

  // The SSE stream is pinned to a session id. Prefer the one we just started
  // (activeSessionId) over the doc's — those agree for the live install, but
  // on a resume we want the operator's current run, not whatever the doc
  // happens to remember.
  const sessionIdForStream =
    activeSessionId ??
    (status?.state === 'INSTALLING' || status?.state === 'DRAINING' || status?.state === 'ADOPTING'
      ? status.installSessionId ?? null
      : null);

  const installMutation = useMutation({
    mutationFn: (dto: InstallDto) =>
      api.post('/storage/install', dto).then((r) => unwrap<{ installSessionId: string }>(r)),
    onSuccess: (data) => {
      setActiveSessionId(data.installSessionId);
      setInstallOpen(false);
      setInstallError(null);
      qc.invalidateQueries({ queryKey: ['shared-storage'] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        (Array.isArray(err?.response?.data?.message) ? err.response.data.message.join('; ') : null) ??
        err?.message ??
        'install failed';
      setInstallError(String(msg));
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: () =>
      api.delete('/storage').then((r) => unwrap<{ installSessionId: string }>(r)),
    onSuccess: (data) => {
      setActiveSessionId(data.installSessionId);
      setRefuseError(null);
      qc.invalidateQueries({ queryKey: ['shared-storage'] });
    },
    onError: (err: any) => {
      // The consumer-refuse case ships a structured response body: the
      // backend throws ConflictException({message, consumers, mountPoint}).
      // Surface the list inline instead of hiding it behind a generic toast.
      const body = err?.response?.data?.message ?? err?.response?.data;
      if (body && typeof body === 'object' && Array.isArray(body.consumers)) {
        setRefuseError({
          message: body.message ?? 'shared storage has active consumers',
          consumers: body.consumers,
          mountPoint: body.mountPoint,
        });
      } else {
        setRefuseError({
          message: typeof body === 'string' ? body : (err?.message ?? 'uninstall failed'),
        });
      }
    },
  });

  const agentTokenMutation = useMutation({
    mutationFn: () =>
      api
        .post('/storage/agent/install-token')
        .then((r) => unwrap<AgentInstallBundle>(r)),
    onSuccess: (data) => {
      setAgentBundle(data);
      setAgentError(null);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'failed to issue install token';
      setAgentError(String(msg));
    },
  });

  function openAgentSetup() {
    setAgentBundle(null);
    setAgentError(null);
    setAgentSetupOpen(true);
    agentTokenMutation.mutate();
  }

  async function onUninstall() {
    const ok = await confirm({
      title: 'Uninstall shared storage?',
      message:
        'This will stop every seaweedfs/nfs container across the cluster and remove the mount units. The operation refuses if any service still bind-mounts the shared path.',
      confirmLabel: 'Uninstall',
      variant: 'destructive',
    });
    if (!ok) return;
    uninstallMutation.mutate();
  }

  const showWizard = !status || status.state === 'UNINSTALLED';
  const showStream =
    sessionIdForStream != null &&
    (status?.state === 'INSTALLING' ||
      status?.state === 'DRAINING' ||
      status?.state === 'ADOPTING' ||
      // Just after a mutation returns we may already have a session id but
      // the query hasn't refetched yet.
      installMutation.isPending ||
      uninstallMutation.isPending);
  // UNINSTALL_FAILED is a dead-end from a user flow standpoint if we don't
  // surface a retry — the FSM allows UNINSTALL_FAILED → DRAINING and the
  // service's atomic acquire now accepts it, so expose the button to let
  // an operator retry after fixing the host (orphaned container, busy mount).
  const canUninstall =
    status?.state === 'HEALTHY' ||
    status?.state === 'DEGRADED' ||
    status?.state === 'UNINSTALL_FAILED';

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <HardDrive className="h-6 w-6" /> Shared Storage
          </h1>
          <p className="text-sm text-muted-foreground">
            Cluster-wide shared filesystem for stacks that need the same files
            on every node. One install per cluster.
          </p>
        </div>
        <div className="flex gap-2">
          {showWizard && (
            <>
              <Button variant="outline" onClick={openAgentSetup}>
                <Terminal className="mr-2 h-4 w-4" /> Setup agents
              </Button>
              <Button
                onClick={() => {
                  setInstallError(null);
                  setInstallOpen(true);
                }}
              >
                Install
              </Button>
            </>
          )}
          {canUninstall && (
            <Button
              variant="destructive"
              onClick={onUninstall}
              disabled={uninstallMutation.isPending}
            >
              {uninstallMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {status?.state === 'UNINSTALL_FAILED' ? 'Retry uninstall' : 'Uninstall'}
            </Button>
          )}
        </div>
      </header>

      {statusQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading storage status…
        </div>
      )}

      {refuseError && refuseError.consumers && (
        <ConsumerRefuseCard
          err={refuseError}
          onDismiss={() => setRefuseError(null)}
        />
      )}

      {status && stateStyle && (
        <StatusCard status={status} stateStyle={stateStyle} />
      )}

      {showStream && sessionIdForStream && (
        <InstallStream
          sessionId={sessionIdForStream}
          onFinalFrame={() => {
            qc.invalidateQueries({ queryKey: ['shared-storage'] });
          }}
        />
      )}

      {showWizard && !statusQuery.isLoading && (
        <EmptyStateCard
          onInstall={() => {
            setInstallError(null);
            setInstallOpen(true);
          }}
        />
      )}

      <InstallDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onSubmit={(dto) => installMutation.mutate(dto)}
        isPending={installMutation.isPending}
        error={installError}
        initialNodes={prefilledNodes}
      />

      <SetupAgentsDialog
        open={agentSetupOpen}
        onOpenChange={setAgentSetupOpen}
        bundle={agentBundle}
        isPending={agentTokenMutation.isPending}
        error={agentError}
        onRegenerate={openAgentSetup}
        onReadyToInstall={(nodes) => {
          setPrefilledNodes(nodes);
          setInstallError(null);
          setInstallOpen(true);
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------
// Status card
// -----------------------------------------------------------------------

function StatusCard({
  status,
  stateStyle,
}: {
  status: SharedStorageStatus;
  stateStyle: (typeof STATE_STYLES)[keyof typeof STATE_STYLES];
}) {
  const consumers = status.lastKnownConsumers ?? [];
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('h-3 w-3 rounded-full', stateStyle.dot)} />
        <span className={cn('text-base font-medium', stateStyle.text)}>
          {stateStyle.label}
        </span>
        <span className="ml-auto rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {status.backend}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Mount point</dt>
          <dd className="font-mono">{status.mountPoint}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nodes</dt>
          <dd className="font-mono">{status.nodes.join(', ')}</dd>
        </div>
        {status.backend === 'nfs' && typeof status.driverOpts?.nfsServerNode === 'string' && (
          <div>
            <dt className="text-muted-foreground">NFS server</dt>
            <dd className="font-mono">{status.driverOpts.nfsServerNode as string}</dd>
          </div>
        )}
        {status.lastHealthCheckAt && (
          <div>
            <dt className="text-muted-foreground">Last probe</dt>
            <dd>{new Date(status.lastHealthCheckAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4">
        <h3 className="text-sm font-medium">
          Consumers ({consumers.length})
          {status.lastConsumerDriftAt && (
            <span className="ml-2 text-xs text-muted-foreground">
              updated {new Date(status.lastConsumerDriftAt).toLocaleString()}
            </span>
          )}
        </h3>
        {consumers.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No stack bind-mounts the shared path. Safe to uninstall.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {consumers.map((c) => (
              <li
                key={c}
                className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
      {status.state === 'DEGRADED' && (
        <div className="mt-4 flex items-start gap-2 rounded bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Probe failed. The reconciler will retry every minute; a successful
            probe moves state to <span className="font-mono">RECOVERING</span>{' '}
            and then back to <span className="font-mono">HEALTHY</span> on the
            second consecutive success.
          </div>
        </div>
      )}
      {status.state === 'UNINSTALL_FAILED' && (
        <div className="mt-4 flex items-start gap-2 rounded bg-red-50 p-3 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            A teardown step exited non-zero. Fix the host (orphaned container,
            busy mount) and re-trigger uninstall. The orchestrator does not
            auto-retry destructive steps.
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyStateCard({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-8 text-center">
      <HardDrive className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-3 text-lg font-medium">No shared storage installed</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Install SeaweedFS (object storage with FUSE mount) or NFS (traditional,
        single-server) to give every node the same files at the same path.
      </p>
      <Button className="mt-4" onClick={onInstall}>
        <PlayCircle className="mr-2 h-4 w-4" /> Install
      </Button>
    </div>
  );
}

function ConsumerRefuseCard({
  err,
  onDismiss,
}: {
  err: { message: string; consumers?: string[]; mountPoint?: string };
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5" />
        <div className="flex-1">
          <h3 className="font-medium">{err.message}</h3>
          {err.mountPoint && (
            <p className="text-xs text-amber-800">
              Mount point: <span className="font-mono">{err.mountPoint}</span>
            </p>
          )}
          {err.consumers && err.consumers.length > 0 && (
            <>
              <p className="mt-2 text-sm">
                Remove or redeploy these stacks without the bind mount, then
                try again:
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {err.consumers.map((c) => (
                  <li
                    key={c}
                    className="rounded bg-amber-200 px-2 py-0.5 font-mono text-xs"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-amber-700 hover:text-amber-900"
          aria-label="Dismiss"
        >
          <XCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Install wizard
// -----------------------------------------------------------------------

type InstallDto = {
  backend: 'seaweedfs' | 'nfs';
  nodes: string[];
  nfsServerNode?: string;
  replication?: string;
  insecure?: boolean;
  mountPoint?: string;
};

const DEFAULT_MOUNT_POINT = '/var/lib/swarmui/shared';
const MOUNT_POINT_UI_RE = /^\/[A-Za-z0-9._\-/]{1,255}$/;

function InstallDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  error,
  initialNodes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dto: InstallDto) => void;
  isPending: boolean;
  error: string | null;
  initialNodes?: string[];
}) {
  const [backend, setBackend] = useState<'seaweedfs' | 'nfs'>('seaweedfs');
  const [nodesRaw, setNodesRaw] = useState('');

  // Pre-fill the node list when the Setup Agents panel hands over a verified
  // ready set — saves the operator from re-typing hostnames.
  useEffect(() => {
    if (open && initialNodes && initialNodes.length > 0) {
      setNodesRaw(initialNodes.join(', '));
    }
  }, [open, initialNodes]);
  const [nfsServerNode, setNfsServerNode] = useState('');
  const [replication, setReplication] = useState('010');
  const [insecure, setInsecure] = useState(true);
  const [mountPoint, setMountPoint] = useState('');

  const nodes = nodesRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const trimmedMount = mountPoint.trim();
  const mountValid =
    trimmedMount === '' ||
    (MOUNT_POINT_UI_RE.test(trimmedMount) &&
      !trimmedMount
        .split('/')
        .some((seg) => seg === '..' || seg === '.'));
  const valid =
    nodes.length > 0 &&
    nodes.every((n) => /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(n)) &&
    (backend !== 'nfs' || /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(nfsServerNode)) &&
    mountValid;

  function submit() {
    if (!valid) return;
    const dto: InstallDto = {
      backend,
      nodes,
      insecure: insecure || undefined,
    };
    if (backend === 'nfs') dto.nfsServerNode = nfsServerNode;
    if (backend === 'seaweedfs') dto.replication = replication;
    if (trimmedMount) dto.mountPoint = trimmedMount;
    onSubmit(dto);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install shared storage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Backend</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBackend('seaweedfs')}
                className={cn(
                  'rounded border p-3 text-left text-sm',
                  backend === 'seaweedfs' && 'border-blue-500 bg-blue-50 text-blue-900',
                )}
              >
                <div className="font-medium">SeaweedFS</div>
                <div className="text-xs text-muted-foreground">
                  Replicated object storage, FUSE mount per node.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBackend('nfs')}
                className={cn(
                  'rounded border p-3 text-left text-sm',
                  backend === 'nfs' && 'border-blue-500 bg-blue-50 text-blue-900',
                )}
              >
                <div className="font-medium">NFS</div>
                <div className="text-xs text-muted-foreground">
                  Classic NFSv4 export from a single server. SPOF.
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Nodes</label>
            <Input
              placeholder="node02, node03, node04"
              value={nodesRaw}
              onChange={(e) => setNodesRaw(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma- or space-separated. Hostnames only — no scheme, no port.
            </p>
          </div>

          {backend === 'nfs' && (
            <div>
              <label className="text-sm font-medium">NFS server node</label>
              <Input
                placeholder="e.g. node02"
                value={nfsServerNode}
                onChange={(e) => setNfsServerNode(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be one of the nodes above. Clients mount from this host.
              </p>
            </div>
          )}

          {backend === 'seaweedfs' && (
            <div>
              <label className="text-sm font-medium">Replication</label>
              <Input
                placeholder="010"
                value={replication}
                onChange={(e) => setReplication(e.target.value)}
                pattern="^[0-9]{3}$"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                3-digit SeaweedFS replication string. 010 = one copy on another
                node (safe default); 000 = no replication (dev only).
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Mount point</label>
            <Input
              placeholder={DEFAULT_MOUNT_POINT}
              value={mountPoint}
              onChange={(e) => setMountPoint(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Absolute POSIX path, same on every node. Leave empty for the
              default. Avoid bare <span className="font-mono">/mnt</span>;
              prefer a subdir like <span className="font-mono">/mnt/swarmui-shared</span>.
            </p>
            {trimmedMount !== '' && !mountValid && (
              <p className="mt-1 text-xs text-red-600">
                Must be an absolute POSIX path with no <span className="font-mono">..</span> segments.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={insecure}
              onChange={(e) => setInsecure(e.target.checked)}
            />
            <span>
              Skip TLS at install.{' '}
              <span className="text-xs text-muted-foreground">
                Dev / trusted networks only.
              </span>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded bg-red-50 p-3 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------
// Live install SSE stream
// -----------------------------------------------------------------------

function InstallStream({
  sessionId,
  onFinalFrame,
}: {
  sessionId: string;
  onFinalFrame: () => void;
}) {
  const [frames, setFrames] = useState<InstallStepEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const token = useAuthStore((s) => s.accessToken);
  const esRef = useRef<EventSource | null>(null);
  // onFinalFrame is a parent callback that could be a fresh closure every
  // render; capture it in a ref so the SSE effect doesn't re-subscribe on
  // every frame.
  const onFinalFrameRef = useRef(onFinalFrame);
  onFinalFrameRef.current = onFinalFrame;

  useEffect(() => {
    if (!sessionId || !token) return;
    // Backend @Sse route is /api/v1/storage/install/:sessionId/events. The
    // axios Authorization header doesn't flow into EventSource, so we pass
    // the access token on the query string. The backend's JwtStrategy
    // uses jwtFromRequestOrQuery which accepts header OR `?token=` param.
    const url = `/api/v1/storage/install/${encodeURIComponent(sessionId)}/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      if (!e.data) return;
      try {
        const parsed = JSON.parse(e.data) as { data?: InstallStepEvent } | InstallStepEvent;
        const frame = ('data' in (parsed as object) && (parsed as { data?: InstallStepEvent }).data)
          ? (parsed as { data: InstallStepEvent }).data
          : (parsed as InstallStepEvent);
        setFrames((prev) => [...prev, frame]);
        if (frame.phase === 'done' || frame.phase === 'failed') {
          // Give the server a tick to persist the terminal state before we
          // refetch — the orchestrator emits the frame, then persistState.
          setTimeout(() => onFinalFrameRef.current(), 300);
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; just reflect the state. A persistent
      // auth failure will show up as "disconnected" plus the terminal state
      // in the status card the next time it refetches.
      setConnected(false);
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId, token]);

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Install progress</h3>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs',
            connected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700',
          )}
        >
          {connected ? 'streaming' : 'reconnecting…'}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Session <span className="font-mono">{sessionId}</span>
      </p>
      <ol className="mt-4 space-y-1.5">
        {frames.length === 0 && (
          <li className="text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Waiting for the first frame…
          </li>
        )}
        {frames.map((f, i) => (
          <li key={i}>
            <FrameRow frame={f} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function FrameRow({ frame }: { frame: InstallStepEvent }) {
  const base = 'flex items-start gap-2 rounded p-2 text-sm';
  if (frame.phase === 'started') {
    return (
      <div className={cn(base, 'bg-blue-50 text-blue-900')}>
        <PlayCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Started · state=<span className="font-mono">{frame.state}</span>
        </div>
      </div>
    );
  }
  if (frame.phase === 'done') {
    return (
      <div className={cn(base, 'bg-green-50 text-green-900')}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Done · state=<span className="font-mono">{frame.state}</span>
        </div>
      </div>
    );
  }
  if (frame.phase === 'failed') {
    return (
      <div className={cn(base, 'bg-red-50 text-red-900')}>
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed · state=<span className="font-mono">{frame.state}</span>
          {frame.stepId && (
            <span>
              {' '}
              at <span className="font-mono">{frame.stepId}</span>
            </span>
          )}
          {frame.cause && (
            <div className="mt-0.5 font-mono text-xs">{frame.cause}</div>
          )}
        </div>
      </div>
    );
  }
  // phase === 'step'
  const ok = frame.exitCode === 0;
  return (
    <div
      className={cn(
        base,
        ok ? 'bg-slate-50 text-slate-900' : 'bg-red-50 text-red-900',
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {frame.frame.toString().padStart(2, '0')}
          </span>
          <span className="font-medium">{frame.stepDescription ?? frame.stepId}</span>
          {frame.nodeId && (
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {frame.nodeId}
            </span>
          )}
        </div>
        {frame.cause && !ok && (
          <div className="mt-0.5 truncate font-mono text-xs">{frame.cause}</div>
        )}
      </div>
      {frame.durationMs != null && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {frame.durationMs}ms
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Setup agents dialog (Sprint 9)
// -----------------------------------------------------------------------

type SwarmNode = { nodeId: string; role: string; availability: string };
type ProbeResult = {
  nodeId: string;
  up: boolean;
  latencyMs?: number;
  error?: string;
};

function SetupAgentsDialog({
  open,
  onOpenChange,
  bundle,
  isPending,
  error,
  onRegenerate,
  onReadyToInstall,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bundle: AgentInstallBundle | null;
  isPending: boolean;
  error: string | null;
  onRegenerate: () => void;
  onReadyToInstall: (nodes: string[]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [swarmNodes, setSwarmNodes] = useState<SwarmNode[] | null>(null);
  const [probeByNode, setProbeByNode] = useState<Record<string, ProbeResult>>({});
  const [probeError, setProbeError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !bundle) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, bundle]);

  // Fetch swarm nodes once when the dialog opens — the probe loop keys off
  // this list, so no list means no polling.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get('/storage/agent/swarm-nodes')
      .then((r) => unwrap<{ nodes: SwarmNode[] }>(r))
      .then((data) => {
        if (!cancelled) setSwarmNodes(data.nodes);
      })
      .catch(() => {
        if (!cancelled) setSwarmNodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Poll every 2s while the dialog is open and there's a non-empty node list.
  // Each tick fires a POST /storage/agent/ping-nodes with the known hostnames
  // and merges per-node results into state.
  useEffect(() => {
    if (!open) return;
    const nodes = swarmNodes?.map((n) => n.nodeId) ?? [];
    if (nodes.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.post('/storage/agent/ping-nodes', { nodes });
        const data = unwrap<{ results: ProbeResult[]; allUp: boolean }>(r);
        if (cancelled) return;
        setProbeError(null);
        const next: Record<string, ProbeResult> = {};
        for (const res of data.results) next[res.nodeId] = res;
        setProbeByNode(next);
      } catch (e: any) {
        if (!cancelled) {
          setProbeError(e?.message ?? 'probe failed');
        }
      }
    };
    void tick();
    const id = window.setInterval(tick, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, swarmNodes]);

  const upCount = Object.values(probeByNode).filter((p) => p.up).length;
  const totalCount = swarmNodes?.length ?? 0;
  const allUp = totalCount > 0 && upCount === totalCount;

  const remainingMs = bundle ? new Date(bundle.expiresAt).getTime() - now : 0;
  const expired = bundle != null && remainingMs <= 0;
  const mmss = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  function proceed(): void {
    const upNodes = Object.values(probeByNode)
      .filter((p) => p.up)
      .map((p) => p.nodeId);
    if (upNodes.length === 0) return;
    onReadyToInstall(upNodes);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" /> Install swarm-agents
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Shared storage needs a signed-WS agent on every node. Paste the
            one-liner below as root on each. The panel below polls
            <span className="font-mono"> :9443</span> every 2 seconds; when
            all nodes turn green you can proceed to install.
          </p>

          {isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating token…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {bundle && (
            <>
              <CopyBlock
                label="Install one-liner (run on every node, as root)"
                content={bundle.installCommand}
                footer={
                  <span
                    className={cn(
                      'text-xs',
                      expired ? 'text-red-600' : 'text-muted-foreground',
                    )}
                  >
                    {expired
                      ? 'Token expired — regenerate'
                      : `Expires in ${mmss(remainingMs)} · installs remaining ${bundle.installsRemaining}`}
                  </span>
                }
              />
              <CopyBlock
                label="Add to backend stack.yml (then restart backend)"
                content={bundle.backendEnv.join('\n')}
              />
            </>
          )}

          {swarmNodes != null && swarmNodes.length > 0 && (
            <div className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  Swarm nodes
                </span>
                <span
                  className={cn(
                    'font-mono',
                    allUp ? 'text-green-700' : 'text-muted-foreground',
                  )}
                >
                  {upCount}/{totalCount} up
                </span>
              </div>
              <ul className="space-y-1">
                {swarmNodes.map((n) => {
                  const probe = probeByNode[n.nodeId];
                  const up = probe?.up === true;
                  return (
                    <li
                      key={n.nodeId}
                      className="flex items-center gap-2 text-sm"
                    >
                      {up ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      <span className="font-mono">{n.nodeId}</span>
                      <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                        {n.role}
                      </span>
                      {up && probe?.latencyMs != null && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {probe.latencyMs}ms
                        </span>
                      )}
                      {!up && probe?.error && (
                        <span className="ml-auto truncate text-xs text-muted-foreground">
                          {probe.error}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {probeError && (
                <p className="mt-2 text-xs text-red-600">{probeError}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={onRegenerate}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {bundle ? 'Regenerate' : 'Generate'}
          </Button>
          <Button onClick={proceed} disabled={!allUp}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Proceed to install ({upCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({
  label,
  content,
  footer,
}: {
  label: string;
  content: string;
  footer?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // clipboard blocked (e.g. non-https origin) — fall back to a prompt
        window.prompt('Copy manually:', content);
      });
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {content}
      </pre>
      {footer && <div className="mt-1 flex justify-end">{footer}</div>}
    </div>
  );
}

import { useAppStore } from '@/stores/app.store';
import { useSwarmInfo, useNodes } from '@/hooks/useDocker';
import { SwarmTopology } from '@/components/docker/SwarmTopology';



export function SwarmPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: swarmInfo, isLoading: swarmLoading } = useSwarmInfo(endpointId);
  const { data: nodes, isLoading: nodesLoading } = useNodes(endpointId);

  const isLoading = swarmLoading || nodesLoading;

  const totalNodes = nodes?.length ?? 0;
  const managers = nodes?.filter((n: any) => n.Spec?.Role === 'manager').length ?? 0;
  const workers = totalNodes - managers;

  // services count is not in swarm info directly; show from swarm JoinTokens presence
  const inSwarm = !!swarmInfo?.ID;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading swarm information...</p>
      </div>
    );
  }

  if (!inSwarm) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Swarm Cluster</h1>
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          This endpoint is not part of a Swarm cluster.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Swarm Cluster</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Nodes</p>
          <p className="text-3xl font-bold mt-1">{totalNodes}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Managers</p>
          <p className="text-3xl font-bold mt-1">{managers}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Workers</p>
          <p className="text-3xl font-bold mt-1">{workers}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Swarm ID</p>
          <p className="text-sm font-mono mt-2 truncate">{swarmInfo?.ID?.slice(0, 12) ?? '—'}</p>
        </div>
      </div>

      {/* Swarm Status */}
      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
        <h2 className="text-lg font-semibold">Swarm Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Local Node State: </span>
            <span className="font-medium">{swarmInfo?.LocalNodeState ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Managers: </span>
            <span className="font-medium">{swarmInfo?.Managers ?? managers}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Nodes: </span>
            <span className="font-medium">{swarmInfo?.Nodes ?? totalNodes}</span>
          </div>
        </div>
      </div>

      {/* Topology */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Cluster Topology</h2>
        <SwarmTopology nodes={nodes ?? []} />
      </div>
    </div>
  );
}

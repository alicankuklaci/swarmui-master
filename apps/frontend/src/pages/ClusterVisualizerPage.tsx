import { useEffect } from 'react';
import { useAppStore } from '@/stores/app.store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, Container, Cpu, MemoryStick } from 'lucide-react';

function bytesToGB(bytes: number) {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

function NodeCard({ node, tasks }: { node: any; tasks: any[] }) {
  const hostname = node.Description?.Hostname ?? node.ID?.slice(0, 12);
  const role = node.Spec?.Role ?? 'worker';
  const availability = node.Spec?.Availability ?? 'active';
  const state = node.Status?.State ?? 'unknown';
  const cpus = node.Description?.Resources?.NanoCPUs ? node.Description.Resources.NanoCPUs / 1e9 : 0;
  const memBytes = node.Description?.Resources?.MemoryBytes ?? 0;
  const os = node.Description?.Platform?.OS ?? '';
  const arch = node.Description?.Platform?.Architecture ?? '';
  const engineVersion = node.Description?.Engine?.EngineVersion ?? '';
  const addr = node.Status?.Addr ?? '';

  const runningTasks = tasks.filter(t => t.Status?.State === 'running');
  const failedTasks = tasks.filter(t => ['failed', 'rejected', 'shutdown'].includes(t.Status?.State));

  const stateColor = state === 'ready' ? 'bg-green-500' : state === 'down' ? 'bg-red-500' : 'bg-yellow-500';
  const availColor = availability === 'active' ? 'text-green-600' : availability === 'drain' ? 'text-red-600' : 'text-yellow-600';

  return (
    <Card className="relative overflow-hidden border-2 hover:shadow-lg transition-shadow">
      {/* Role stripe */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${role === 'manager' ? 'bg-blue-500' : 'bg-gray-400'}`} />

      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${stateColor} flex-shrink-0 mt-0.5`} />
            <div>
              <CardTitle className="text-base">{hostname}</CardTitle>
              <p className="text-xs text-muted-foreground">{addr}</p>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            <Badge variant={role === 'manager' ? 'default' : 'secondary'} className="text-xs">{role}</Badge>
            <Badge variant="outline" className={`text-xs ${availColor}`}>{availability}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Resources */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Cpu className="w-3 h-3" />
            <span>{cpus} CPUs</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <MemoryStick className="w-3 h-3" />
            <span>{bytesToGB(memBytes)} GB</span>
          </div>
          <div className="text-muted-foreground col-span-2">{os}/{arch} · Docker {engineVersion}</div>
        </div>

        {/* Tasks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium flex items-center gap-1">
              <Container className="w-3 h-3" /> Tasks ({tasks.length})
            </span>
            {failedTasks.length > 0 && (
              <span className="text-xs text-red-500">{failedTasks.length} failed</span>
            )}
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No tasks</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {tasks.map((task: any) => {
                const tState = task.Status?.State ?? 'unknown';
                const svcName = task.Spec?.ContainerSpec?.Image?.split('/').pop()?.split(':')[0]?.split('@')[0] ?? task.ServiceID?.slice(0, 8) ?? '?';
                const stateClr = tState === 'running' ? 'bg-green-100 border-green-300 text-green-800'
                  : tState === 'failed' || tState === 'rejected' ? 'bg-red-100 border-red-300 text-red-800'
                  : 'bg-gray-100 border-gray-300 text-gray-700';
                return (
                  <div key={task.ID} className={`flex items-center justify-between px-2 py-1 rounded border text-xs ${stateClr}`}>
                    <span className="truncate max-w-[140px] font-medium">{svcName}</span>
                    <span className="ml-2 capitalize flex-shrink-0">{tState}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Running indicator */}
        <div className="flex items-center gap-2 pt-1 border-t">
          <div className="flex-1 bg-muted rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: tasks.length ? `${(runningTasks.length / tasks.length) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{runningTasks.length}/{tasks.length} running</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClusterVisualizerPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';

  const setSelectedEndpoint = useAppStore((s) => s.setSelectedEndpoint);

  const { data: endpointsData } = useQuery({
    queryKey: ['viz-endpoints'],
    queryFn: () => api.get('/endpoints?limit=100').then(r => r.data?.data ?? r.data),
  });

  useEffect(() => {
    if (!endpointId && endpointsData?.data?.length) {
      setSelectedEndpoint(endpointsData.data[0]._id);
    }
  }, [endpointId, endpointsData, setSelectedEndpoint]);


  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ['viz-nodes', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/nodes`).then(r => r.data?.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 10000,
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['viz-tasks', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/tasks`).then(r => r.data?.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 10000,
  });

  const { data: swarmInfo } = useQuery({
    queryKey: ['swarm-info', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/info`).then(r => r.data?.data ?? {}),
    enabled: !!endpointId,
  });

  const nodes: any[] = nodesData ?? [];
  const tasks: any[] = tasksData ?? [];
  const isLoading = nodesLoading || tasksLoading;

  const managers = nodes.filter(n => n.Spec?.Role === 'manager');
  const workers = nodes.filter(n => n.Spec?.Role !== 'manager');
  const totalRunning = tasks.filter(t => t.Status?.State === 'running').length;

  if (!endpointId) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-muted-foreground">No endpoint selected. Go to Endpoints to configure one.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cluster Visualizer</h1>
        <p className="text-muted-foreground">Real-time view of your Docker Swarm cluster</p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Nodes', value: nodes.length, color: 'text-blue-600' },
          { label: 'Managers', value: managers.length, color: 'text-purple-600' },
          { label: 'Workers', value: workers.length, color: 'text-gray-600' },
          { label: 'Running Tasks', value: totalRunning, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-muted-foreground">Loading cluster state...</div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground">No nodes found. Make sure this endpoint is a Swarm manager.</p>
        </div>
      ) : (
        <>
          {/* Managers */}
          {managers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-sm bg-blue-500" />
                <h2 className="font-semibold text-sm">Managers ({managers.length})</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {managers.map(node => (
                  <NodeCard
                    key={node.ID}
                    node={node}
                    tasks={tasks.filter(t => t.NodeID === node.ID)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Workers */}
          {workers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-sm bg-gray-400" />
                <h2 className="font-semibold text-sm">Workers ({workers.length})</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {workers.map(node => (
                  <NodeCard
                    key={node.ID}
                    node={node}
                    tasks={tasks.filter(t => t.NodeID === node.ID)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground text-right">Auto-refreshes every 10 seconds</p>
    </div>
  );
}

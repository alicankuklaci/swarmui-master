import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/app.store';
import { api } from '@/lib/api';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useContainer } from '@/hooks/useDocker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/docker/StatusBadge';
import { LogViewer } from '@/components/docker/LogViewer';
import { StatsChart } from '@/components/docker/StatsChart';
import { ContainerConsole } from '@/components/docker/ContainerConsole';
import { ArrowLeftIcon, ServerIcon, LayersIcon, ExternalLinkIcon } from 'lucide-react';



export function ContainerDetailPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { id } = useParams<{ id: string }>();
  const containerId = id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'logs';

  const { data: container, isLoading } = useContainer(endpointId, containerId);

  const name =
    container?.Name?.replace(/^\//, '') ??
    container?.Names?.[0]?.replace(/^\//, '') ??
    containerId.slice(0, 12);

  const status = container?.State?.Status ?? container?.Status ?? 'unknown';
  const isSwarmTask = !!(container as any)?._swarmTask;
  const nodeId = (container as any)?._nodeId;
  const serviceName = (container as any)?._serviceName;
  const serviceId = (container as any)?._serviceId;

  const [agentUrl, setAgentUrl] = useState<string | null>(null);
  const [remoteContainerId, setRemoteContainerId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSwarmTask || !containerId || !endpointId) return;
    api.get(`/endpoints/${endpointId}/containers/${containerId}/node-info`)
      .then((res) => {
        const info = res.data?.data ?? res.data;
        if (info?.agentUrl) {
          setAgentUrl(info.agentUrl);
          setRemoteContainerId(containerId);
        }
      })
      .catch(() => {});
  }, [isSwarmTask, containerId, endpointId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading container...</p>
      </div>
    );
  }

  if (!container) {
    return (
      <div className="p-6">
        <Link to="/containers">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Containers
          </Button>
        </Link>
        <p className="mt-6 text-muted-foreground">Container not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/containers">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{name}</h1>
        <StatusBadge status={status} />
        {isSwarmTask && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <LayersIcon className="h-3 w-3" /> Swarm Task
          </Badge>
        )}
        <span className="text-xs font-mono text-muted-foreground">
          {containerId.slice(0, 12)}
        </span>
        {isSwarmTask && nodeId && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <ServerIcon className="h-3 w-3" /> Node: {nodeId.slice(0, 12)}
          </span>
        )}
        {serviceName && (
          <Link to={`/services`}>
            <Button variant="ghost" size="sm" className="text-xs">
              <ExternalLinkIcon className="h-3 w-3 mr-1" /> {serviceName}
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({tab: v})}>
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="inspect">Inspect</TabsTrigger>
        </TabsList>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          {isSwarmTask && !agentUrl ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
              <LayersIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Resolving node agent...</p>
            </div>
          ) : isSwarmTask && agentUrl ? (
            <LogViewer
              endpointId={endpointId}
              containerId={remoteContainerId || containerId}
              agentUrl={agentUrl}
            />
          ) : (
            <LogViewer endpointId={endpointId} containerId={containerId} />
          )}
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="mt-4">
          {isSwarmTask ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
              <p>Stats not available for remote swarm tasks.</p>
            </div>
          ) : (
            <StatsChart endpointId={endpointId} containerId={containerId} />
          )}
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console" className="mt-4">
          {isSwarmTask && agentUrl ? (
            <ContainerConsole
              endpointId={endpointId}
              containerId={remoteContainerId || containerId}
              agentUrl={agentUrl}
            />
          ) : isSwarmTask ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
              <p>Resolving node agent...</p>
            </div>
          ) : (
            <ContainerConsole endpointId={endpointId} containerId={containerId} />
          )}
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="mt-4">
          <ResourcesForm endpointId={endpointId} containerId={containerId} container={container} />
        </TabsContent>

        {/* Inspect Tab */}
        <TabsContent value="inspect" className="mt-4">
          <div className="rounded-lg border bg-muted/30 p-4 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(container, null, 2)}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResourcesForm({ endpointId, containerId, container }: { endpointId: string; containerId: string; container: any }) {
  const currentMem = container?.HostConfig?.Memory || 0;
  const currentCpuQuota = container?.HostConfig?.CpuQuota || 0;
  const currentCpuShares = container?.HostConfig?.CpuShares || 0;

  const [memory, setMemory] = useState(String(Math.floor(currentMem / (1024 * 1024))));
  const [cpuQuota, setCpuQuota] = useState(String(currentCpuQuota));
  const [cpuShares, setCpuShares] = useState(String(currentCpuShares));
  const [msg, setMsg] = useState('');

  const mutation = useMutation({
    mutationFn: (body: any) => api.patch(`/endpoints/${endpointId}/containers/${containerId}/resources`, body),
    onSuccess: () => setMsg('Resources updated successfully'),
    onError: (e: any) => setMsg('Error: ' + (e.response?.data?.message || e.message)),
  });

  function handleSave() {
    const memBytes = parseInt(memory) * 1024 * 1024;
    mutation.mutate({
      memory: memBytes >= 0 ? memBytes : 0,
      cpuQuota: parseInt(cpuQuota) || 0,
      cpuShares: parseInt(cpuShares) || 0,
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label>Memory Limit (MB, 0 = unlimited)</Label>
        <Input type="number" value={memory} onChange={(e) => setMemory(e.target.value)} min="0" />
      </div>
      <div className="space-y-2">
        <Label>CPU Quota (0 = unlimited, max 100000)</Label>
        <Input type="number" value={cpuQuota} onChange={(e) => setCpuQuota(e.target.value)} min="0" max="100000" />
      </div>
      <div className="space-y-2">
        <Label>CPU Shares</Label>
        <Input type="number" value={cpuShares} onChange={(e) => setCpuShares(e.target.value)} min="0" />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>{msg}</p>}
      <Button onClick={handleSave} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Save Resources'}
      </Button>
    </div>
  );
}

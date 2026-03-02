import { useAppStore } from '@/stores/app.store';
import { Link, useParams } from 'react-router-dom';
import { useContainer } from '@/hooks/useDocker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/docker/StatusBadge';
import { LogViewer } from '@/components/docker/LogViewer';
import { StatsChart } from '@/components/docker/StatsChart';
import { ContainerConsole } from '@/components/docker/ContainerConsole';
import { ArrowLeftIcon } from 'lucide-react';



export function ContainerDetailPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { id } = useParams<{ id: string }>();
  const containerId = id ?? '';

  const { data: container, isLoading } = useContainer(endpointId, containerId);

  const name =
    container?.Name?.replace(/^\//, '') ??
    container?.Names?.[0]?.replace(/^\//, '') ??
    containerId.slice(0, 12);

  const status = container?.State?.Status ?? container?.Status ?? 'unknown';

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
      <div className="flex items-center gap-4">
        <Link to="/containers">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{name}</h1>
        <StatusBadge status={status} />
        <span className="text-xs font-mono text-muted-foreground">
          {containerId.slice(0, 12)}
        </span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="inspect">Inspect</TabsTrigger>
        </TabsList>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <LogViewer endpointId={endpointId} containerId={containerId} />
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="mt-4">
          <StatsChart endpointId={endpointId} containerId={containerId} />
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console" className="mt-4">
          <ContainerConsole endpointId={endpointId} containerId={containerId} />
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

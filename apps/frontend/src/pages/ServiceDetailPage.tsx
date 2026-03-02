import { useAppStore } from '@/stores/app.store';
import { Link, useParams } from 'react-router-dom';
import { useService, useServiceTasks } from '@/hooks/useDocker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/docker/StatusBadge';
import { LogViewer } from '@/components/docker/LogViewer';
import { ArrowLeftIcon } from 'lucide-react';



function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function ServiceDetailPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { id } = useParams<{ id: string }>();
  const serviceId = id ?? '';

  const { data: service, isLoading: serviceLoading } = useService(endpointId, serviceId);
  const { data: tasks, isLoading: tasksLoading } = useServiceTasks(endpointId, serviceId);

  const serviceName = service?.Spec?.Name ?? serviceId;

  if (serviceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading service...</p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-6">
        <Link to="/services">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Services
          </Button>
        </Link>
        <p className="mt-6 text-muted-foreground">Service not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/services">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{serviceName}</h1>
        <span className="text-xs font-mono text-muted-foreground">{serviceId.slice(0, 12)}</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          {tasksLoading ? (
            <p className="text-muted-foreground text-sm">Loading tasks...</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">ID</th>
                    <th className="text-left px-4 py-3 font-medium">Node</th>
                    <th className="text-left px-4 py-3 font-medium">Image</th>
                    <th className="text-left px-4 py-3 font-medium">State</th>
                    <th className="text-left px-4 py-3 font-medium">Desired State</th>
                    <th className="text-left px-4 py-3 font-medium">Error</th>
                    <th className="text-left px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(tasks ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        No tasks found.
                      </td>
                    </tr>
                  )}
                  {(tasks ?? []).map((task: any) => {
                    const state = task.Status?.State ?? '—';
                    const desiredState = task.DesiredState ?? '—';
                    const errorMsg = task.Status?.Err ?? '';
                    const image =
                      task.Spec?.ContainerSpec?.Image?.split('@')[0] ?? '—';
                    const nodeId = task.NodeID?.slice(0, 12) ?? '—';
                    const taskShortId = (task.ID ?? '').slice(0, 12);

                    return (
                      <tr key={task.ID} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{taskShortId}</td>
                        <td className="px-4 py-3 font-mono text-xs">{nodeId}</td>
                        <td className="px-4 py-3 font-mono text-xs max-w-[180px] truncate">
                          {image}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={state} />
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground text-xs">
                          {desiredState}
                        </td>
                        <td className="px-4 py-3 text-xs text-destructive max-w-[160px] truncate">
                          {errorMsg || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatTimestamp(task.UpdatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <LogViewer endpointId={endpointId} containerId={serviceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

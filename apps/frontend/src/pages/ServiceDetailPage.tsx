import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useService, useServiceTasks } from '@/hooks/useDocker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/docker/StatusBadge';
import { LogViewer } from '@/components/docker/LogViewer';
import { ArrowLeftIcon, RotateCw } from 'lucide-react';



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
          <TabsTrigger value="update-policy">Update Policy</TabsTrigger>
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
          <LogViewer endpointId={endpointId} containerId={serviceId} resourceType="service" />
        </TabsContent>

        {/* Update Policy Tab */}
        <TabsContent value="update-policy" className="mt-4">
          <UpdatePolicyForm endpointId={endpointId} serviceId={serviceId} service={service} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UpdatePolicyForm({ endpointId, serviceId, service }: { endpointId: string; serviceId: string; service: any }) {
  const qc = useQueryClient();
  const updateConfig = service?.Spec?.UpdateConfig || {};
  const [parallelism, setParallelism] = useState(String(updateConfig.Parallelism ?? 1));
  const [delay, setDelay] = useState(String((updateConfig.Delay ?? 0) / 1000000000));
  const [failureAction, setFailureAction] = useState(updateConfig.FailureAction || 'pause');
  const [order, setOrder] = useState(updateConfig.Order || 'stop-first');
  const [msg, setMsg] = useState('');

  const policyMutation = useMutation({
    mutationFn: (body: any) => api.patch(`/endpoints/${endpointId}/swarm/services/${serviceId}/update-policy`, body),
    onSuccess: () => {
      setMsg('Update policy saved');
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
    },
    onError: (e: any) => setMsg('Error: ' + (e.response?.data?.message || e.message)),
  });

  const forceMutation = useMutation({
    mutationFn: () => api.post(`/endpoints/${endpointId}/swarm/services/${serviceId}/force-update`),
    onSuccess: () => {
      setMsg('Force redeploy triggered');
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
    },
    onError: (e: any) => setMsg('Error: ' + (e.response?.data?.message || e.message)),
  });

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label>Parallelism (simultaneous updates)</Label>
        <Input type="number" value={parallelism} onChange={(e) => setParallelism(e.target.value)} min="0" />
      </div>
      <div className="space-y-2">
        <Label>Update Delay (seconds)</Label>
        <Input type="number" value={delay} onChange={(e) => setDelay(e.target.value)} min="0" />
      </div>
      <div className="space-y-2">
        <Label>Failure Action</Label>
        <Select value={failureAction} onValueChange={setFailureAction}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pause">Pause</SelectItem>
            <SelectItem value="continue">Continue</SelectItem>
            <SelectItem value="rollback">Rollback</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Update Order</Label>
        <Select value={order} onValueChange={setOrder}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stop-first">Stop First</SelectItem>
            <SelectItem value="start-first">Start First</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {msg && <p className={`text-sm ${msg.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>{msg}</p>}
      <div className="flex gap-2">
        <Button onClick={() => policyMutation.mutate({ parallelism: parseInt(parallelism), delay: parseInt(delay), failureAction, order })} disabled={policyMutation.isPending}>
          {policyMutation.isPending ? 'Saving...' : 'Save Policy'}
        </Button>
        <Button variant="outline" onClick={() => forceMutation.mutate()} disabled={forceMutation.isPending}>
          <RotateCw className="w-4 h-4 mr-2" />
          Force Redeploy
        </Button>
      </div>
    </div>
  );
}

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
import { ArrowLeftIcon, RotateCw, Minus, Plus, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export function ServiceDetailPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { id } = useParams<{ id: string }>();
  const serviceId = id ?? '';
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: service = [], isLoading: serviceLoading } = useService(endpointId, serviceId);
  const { data: tasks = [], isLoading: tasksLoading } = useServiceTasks(endpointId, serviceId);

  // Scale state
  const currentReplicas: number = service?.Spec?.Mode?.Replicated?.Replicas ?? 0;
  const [replicas, setReplicas] = useState<number | null>(null);
  const displayReplicas = replicas !== null ? replicas : currentReplicas;

  const scaleMutation = useMutation({
    mutationFn: (r: number) => api.post(`/endpoints/${endpointId}/swarm/services/${serviceId}/scale`, { replicas: r }),
    onSuccess: () => {
      toast({ title: 'Scaled', description: `Service scaled to ${displayReplicas} replicas` });
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
      qc.invalidateQueries({ queryKey: ['service-tasks', endpointId, serviceId] });
      setReplicas(null);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Scale failed', description: e.response?.data?.message || e.message }),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => api.post(`/endpoints/${endpointId}/swarm/services/${serviceId}/rollback`),
    onSuccess: () => {
      toast({ title: 'Rollback triggered', description: 'Service is rolling back to previous version' });
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Rollback failed', description: e.response?.data?.message || e.message }),
  });

  const serviceName = service?.Spec?.Name ?? serviceId;
  const image = service?.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—';
  const runningTasks = (tasks ?? []).filter((t: any) => t.Status?.State === 'running').length;

  if (serviceLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Loading service...</p></div>;
  }

  if (!service) {
    return (
      <div className="p-6">
        <Link to="/services"><Button variant="outline" size="sm"><ArrowLeftIcon className="h-4 w-4 mr-2" />Back to Services</Button></Link>
        <p className="mt-6 text-muted-foreground">Service not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/services"><Button variant="outline" size="sm"><ArrowLeftIcon className="h-4 w-4 mr-2" />Back</Button></Link>
        <div>
          <h1 className="text-2xl font-bold">{serviceName}</h1>
          <p className="text-xs font-mono text-muted-foreground">{serviceId.slice(0, 12)} · {image}</p>
        </div>
      </div>

      {/* Scale & Rollback Bar */}
      <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Replicas:</span>
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setReplicas(Math.max(0, displayReplicas - 1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="number" min="0" value={displayReplicas}
            onChange={(e) => setReplicas(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-20 h-8 text-center font-bold"
          />
          <Button variant="outline" size="icon" className="h-8 w-8"
            onClick={() => setReplicas(displayReplicas + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => scaleMutation.mutate(displayReplicas)}
            disabled={scaleMutation.isPending || displayReplicas === currentReplicas}
          >
            {scaleMutation.isPending ? 'Scaling...' : 'Scale'}
          </Button>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Running: <span className="font-bold text-foreground">{runningTasks}/{currentReplicas}</span>
          </span>
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm"
            onClick={() => rollbackMutation.mutate()}
            disabled={rollbackMutation.isPending}>
            <Undo2 className="h-4 w-4 mr-2" />
            {rollbackMutation.isPending ? 'Rolling back...' : 'Rollback'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="update">Update Service</TabsTrigger>
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
                    <th className="text-left px-4 py-3 font-medium">Desired</th>
                    <th className="text-left px-4 py-3 font-medium">Error</th>
                    <th className="text-left px-4 py-3 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {(tasks ?? []).length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No tasks found.</td></tr>
                  )}
                  {(tasks ?? []).map((task: any) => (
                    <tr key={task.ID} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{(task.ID ?? '').slice(0, 12)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{task.NodeID?.slice(0, 12) ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs max-w-[180px] truncate">
                        {task.Spec?.ContainerSpec?.Image?.split('@')[0] ?? '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={task.Status?.State ?? '—'} /></td>
                      <td className="px-4 py-3 capitalize text-muted-foreground text-xs">{task.DesiredState ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-destructive max-w-[160px] truncate">{task.Status?.Err || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatTimestamp(task.UpdatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <LogViewer endpointId={endpointId} containerId={serviceId} resourceType="service" />
        </TabsContent>

        {/* Update Service Tab */}
        <TabsContent value="update" className="mt-4">
          <ServiceUpdateForm endpointId={endpointId} serviceId={serviceId} service={service} />
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
  const { toast } = useToast();
  const updateConfig = service?.Spec?.UpdateConfig || {};
  const [parallelism, setParallelism] = useState(String(updateConfig.Parallelism ?? 1));
  const [delay, setDelay] = useState(String((updateConfig.Delay ?? 0) / 1000000000));
  const [failureAction, setFailureAction] = useState(updateConfig.FailureAction || 'pause');
  const [order, setOrder] = useState(updateConfig.Order || 'stop-first');

  const policyMutation = useMutation({
    mutationFn: (body: any) => api.patch(`/endpoints/${endpointId}/swarm/services/${serviceId}/update-policy`, body),
    onSuccess: () => {
      toast({ title: 'Update policy saved' });
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.message || e.message }),
  });

  const forceMutation = useMutation({
    mutationFn: () => api.post(`/endpoints/${endpointId}/swarm/services/${serviceId}/force-update`),
    onSuccess: () => {
      toast({ title: 'Force redeploy triggered' });
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.response?.data?.message || e.message }),
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
      <div className="flex gap-2">
        <Button
          onClick={() => policyMutation.mutate({ parallelism: parseInt(parallelism), delay: parseInt(delay) * 1000000000, failureAction, order })}
          disabled={policyMutation.isPending}
        >
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

function ServiceUpdateForm({ endpointId, serviceId, service }: { endpointId: string; serviceId: string; service: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const spec = service?.Spec ?? {};
  const ct = spec?.TaskTemplate?.ContainerSpec ?? {};
  const currentImage = ct.Image?.split('@')[0] ?? '';
  const currentEnv: string[] = ct.Env ?? [];
  const currentConstraints: string[] = spec.TaskTemplate?.Placement?.Constraints ?? [];
  const currentLabels: Record<string,string> = spec.Labels ?? {};

  const [image, setImage] = useState(currentImage);
  const [showEnv, setShowEnv] = useState(false);
  const [envLines, setEnvLines] = useState(currentEnv.join('\n'));
  const [constraintLines, setConstraintLines] = useState(currentConstraints.join('\n'));
  const [labelLines, setLabelLines] = useState(
    Object.entries(currentLabels).map(([k,v]) => `${k}=${v}`).join('\n')
  );

  const updateMutation = useMutation({
    mutationFn: (body: any) => api.patch(`/endpoints/${endpointId}/swarm/services/${serviceId}`, body),
    onSuccess: () => {
      toast({ title: 'Service updated', description: 'Changes applied successfully' });
      qc.invalidateQueries({ queryKey: ['service', endpointId, serviceId] });
      qc.invalidateQueries({ queryKey: ['service-tasks', endpointId, serviceId] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Update failed', description: e.response?.data?.message || e.message }),
  });

  const handleSubmit = () => {
    const newSpec = JSON.parse(JSON.stringify(spec));
    // Image
    if (image.trim()) {
      newSpec.TaskTemplate.ContainerSpec.Image = image.trim();
    }
    // Env
    const envArr = envLines.split('\n').map(l => l.trim()).filter(Boolean);
    newSpec.TaskTemplate.ContainerSpec.Env = envArr;
    // Constraints
    const constraintArr = constraintLines.split('\n').map(l => l.trim()).filter(Boolean);
    if (!newSpec.TaskTemplate.Placement) newSpec.TaskTemplate.Placement = {};
    newSpec.TaskTemplate.Placement.Constraints = constraintArr;
    // Labels
    const labelObj: Record<string,string> = {};
    labelLines.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0) labelObj[line.slice(0,eq)] = line.slice(eq+1);
    });
    newSpec.Labels = labelObj;

    updateMutation.mutate(newSpec);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label className="font-semibold">Image</Label>
        <Input value={image} onChange={e => setImage(e.target.value)} placeholder="nginx:latest" className="font-mono text-sm" />
        <p className="text-xs text-muted-foreground">Image'ı değiştirmek servisin rolling update başlatır</p>
      </div>

      <div className="space-y-2">
        <Label className="font-semibold">Environment Variables</Label>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Her satıra bir değişken: KEY=VALUE</p>
          <button className="text-xs text-primary" onClick={() => setShowEnv(s=>!s)}>
            {showEnv ? '🙈 Gizle' : '👁 Göster'}
          </button>
        </div>
        <textarea
          value={showEnv ? envLines : envLines.split('\n').map(l => {
            const eq = l.indexOf('=');
            if (eq < 0) return l;
            const key = l.slice(0, eq);
            const isSensitive = /password|secret|key|token|pass|jwt|encrypt/i.test(key);
            return isSensitive ? key + '=••••••••' : l;
          }).join('\n')}
          onChange={e => { if (showEnv) setEnvLines(e.target.value); }}
          readOnly={!showEnv}
          className="w-full h-40 px-3 py-2 border rounded-md font-mono text-xs bg-background resize-y"
          placeholder={"NODE_ENV=production\nPORT=3000"}
        />
        {!showEnv && <p className="text-xs text-amber-600">⚠ Hassas değerler maskelendi. Düzenlemek için "Göster"e tıklayın.</p>}
      </div>

      <div className="space-y-2">
        <Label className="font-semibold">Placement Constraints</Label>
        <p className="text-xs text-muted-foreground">Her satıra bir constraint: node.role == manager</p>
        <textarea
          value={constraintLines}
          onChange={e => setConstraintLines(e.target.value)}
          className="w-full h-24 px-3 py-2 border rounded-md font-mono text-xs bg-background resize-y"
          placeholder={"node.role == manager\nnode.hostname == node01"}
        />
      </div>

      <div className="space-y-2">
        <Label className="font-semibold">Service Labels</Label>
        <p className="text-xs text-muted-foreground">Her satıra bir label: key=value</p>
        <textarea
          value={labelLines}
          onChange={e => setLabelLines(e.target.value)}
          className="w-full h-24 px-3 py-2 border rounded-md font-mono text-xs bg-background resize-y"
          placeholder={"com.example.version=1.0\ntraefik.enable=true"}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSubmit} disabled={updateMutation.isPending} className="min-w-32">
          {updateMutation.isPending ? 'Updating...' : '✓ Apply Changes'}
        </Button>
        <Button variant="outline" onClick={() => {
          setImage(currentImage);
          setEnvLines(currentEnv.join('\n'));
          setConstraintLines(currentConstraints.join('\n'));
          setLabelLines(Object.entries(currentLabels).map(([k,v]) => `${k}=${v}`).join('\n'));
        }}>Reset</Button>
        <span className="text-xs text-muted-foreground">
          {updateMutation.isSuccess ? '✓ Son güncelleme başarılı' : ''}
          {updateMutation.isError ? '✗ Hata oluştu' : ''}
        </span>
      </div>
    </div>
  );
}

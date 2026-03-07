import { useQuery } from '@tanstack/react-query';
import { Server, Users, Network, Activity, Box, GitBranch, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/stores/app.store';
import { Link } from 'react-router-dom';

function StatCard({ title, value, icon: Icon, description, color, to }: {
  title: string; value: string | number; icon: React.ElementType;
  description?: string; color: string; to?: string;
}) {
  const inner = (
    <Card className={to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color}`}><Icon className="h-4 w-4 text-white" /></div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';

  const { data: usersData } = useQuery({
    queryKey: ['users-count'],
    queryFn: () => api.get('/users?limit=1').then(r => r.data.data),
  });

  const { data: endpointsData } = useQuery({
    queryKey: ['endpoints-list'],
    queryFn: () => api.get('/endpoints?limit=100').then(r => r.data.data),
  });

  const { data: swarmInfo } = useQuery({
    queryKey: ['swarm-info', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/info`).then(r => r.data.data),
    enabled: !!endpointId,
    refetchInterval: 15000,
  });

  const { data: nodesData } = useQuery({
    queryKey: ['dash-nodes', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/nodes`).then(r => r.data.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 15000,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['dash-services', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/services`).then(r => r.data.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 15000,
  });

  const { data: stacksData } = useQuery({
    queryKey: ['dash-stacks', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/stacks`).then(r => r.data.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 15000,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['dash-tasks', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/tasks`).then(r => r.data.data ?? []),
    enabled: !!endpointId,
    refetchInterval: 15000,
  });

  const nodes: any[] = nodesData ?? [];
  const services: any[] = servicesData ?? [];
  const stacks: any[] = stacksData ?? [];
  const tasks: any[] = tasksData ?? [];

  const totalCpus = nodes.reduce((s, n) => s + (n.Description?.Resources?.NanoCPUs ?? 0) / 1e9, 0);
  const totalMemGB = nodes.reduce((s, n) => s + (n.Description?.Resources?.MemoryBytes ?? 0) / 1024 / 1024 / 1024, 0);
  const readyNodes = nodes.filter(n => n.Status?.State === 'ready').length;
  const runningTasks = tasks.filter(t => t.Status?.State === 'running').length;
  const failedTasks = tasks.filter(t => ['failed', 'rejected'].includes(t.Status?.State)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">SwarmUI Master — cluster overview</p>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Nodes" value={`${readyNodes}/${nodes.length}`} icon={Server}
          description={`${nodes.filter(n=>n.Spec?.Role==='manager').length} manager(s)`}
          color="bg-blue-500" to="/swarm" />
        <StatCard title="Services" value={services.length} icon={Layers}
          description={`${stacks.length} stacks`} color="bg-purple-500" to="/services" />
        <StatCard title="Running Tasks" value={runningTasks} icon={Activity}
          description={failedTasks > 0 ? `⚠ ${failedTasks} failed` : 'All healthy'}
          color={failedTasks > 0 ? 'bg-red-500' : 'bg-green-500'} />
        <StatCard title="Users" value={usersData?.total || 0} icon={Users}
          description="Active accounts" color="bg-orange-500" to="/users" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cluster Resources */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" /> Cluster Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No endpoint selected or no nodes found.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-bold text-blue-600">{totalCpus.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">Total vCPUs</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-2xl font-bold text-purple-600">{totalMemGB.toFixed(0)} GB</p>
                    <p className="text-xs text-muted-foreground">Total Memory</p>
                  </div>
                </div>
                <div className="space-y-3 pt-1">
                  {nodes.map(node => (
                    <div key={node.ID} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium truncate max-w-[120px]">{node.Description?.Hostname}</span>
                        <Badge variant={node.Status?.State === 'ready' ? 'success' : 'destructive'} className="text-xs h-4">
                          {node.Status?.State}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{((node.Description?.Resources?.NanoCPUs ?? 0) / 1e9).toFixed(0)} CPU</span>
                        <span>·</span>
                        <span>{((node.Description?.Resources?.MemoryBytes ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                        <span>·</span>
                        <span className="capitalize">{node.Spec?.Role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Services Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" /> Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">No services running.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {services.map((svc: any) => {
                  const desired = svc.Spec?.Mode?.Replicated?.Replicas ?? 0;
                  const running = tasks.filter(t => t.ServiceID === svc.ID && t.Status?.State === 'running').length;
                  const healthy = running >= desired;
                  return (
                    <Link key={svc.ID} to={`/services/${svc.ID}`}>
                      <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="text-sm truncate">{svc.Spec?.Name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                          {running}/{desired}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stacks + Quick Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> Stacks ({stacks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stacks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stacks deployed.</p>
              ) : (
                <div className="space-y-1">
                  {stacks.map((stack: any) => (
                    <Link key={stack.name} to={`/stacks/${stack.name}`}>
                      <div className="flex justify-between items-center py-1 px-2 rounded hover:bg-muted/50">
                        <span className="text-sm font-medium">{stack.name}</span>
                        <Badge variant="secondary" className="text-xs">{stack.services ?? stack.serviceCount ?? '?'} svc</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ['Platform', 'SwarmUI Master v1.0'],
                ['Swarm State', swarmInfo?.localNodeState ?? '—'],
                ['Node Role', swarmInfo?.controlAvailable ? 'Manager' : 'Worker'],
                ['Managers', swarmInfo?.managers ?? '—'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v as string}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

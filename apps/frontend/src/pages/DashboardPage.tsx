import { useQuery } from '@tanstack/react-query';
import { Server, Users, Shield, Activity, Container, Network } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function StatCard({ title, value, icon: Icon, description, color }: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data: usersData } = useQuery({
    queryKey: ['users-count'],
    queryFn: async () => {
      const res = await api.get('/users?limit=1');
      return res.data.data;
    },
  });

  const { data: endpointsData } = useQuery({
    queryKey: ['endpoints-list'],
    queryFn: async () => {
      const res = await api.get('/endpoints?limit=100');
      return res.data.data;
    },
  });

  const activeEndpoints = endpointsData?.data?.filter((e: any) => e.status === 'active') || [];
  const totalEndpoints = endpointsData?.total || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">SwarmUI system overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Endpoints"
          value={totalEndpoints}
          icon={Server}
          description={`${activeEndpoints.length} active`}
          color="bg-blue-500"
        />
        <StatCard
          title="Total Users"
          value={usersData?.total || 0}
          icon={Users}
          description="Active accounts"
          color="bg-green-500"
        />
        <StatCard
          title="Swarm Nodes"
          value={activeEndpoints.filter((e: any) => e.swarmEnabled).length}
          icon={Network}
          description="Swarm-enabled endpoints"
          color="bg-purple-500"
        />
        <StatCard
          title="System Status"
          value="Online"
          icon={Activity}
          description="All services running"
          color="bg-orange-500"
        />
      </div>

      {/* Endpoints Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            {endpointsData?.data?.length === 0 ? (
              <p className="text-muted-foreground text-sm">No endpoints configured. Go to Endpoints to add one.</p>
            ) : (
              <div className="space-y-3">
                {endpointsData?.data?.slice(0, 5).map((endpoint: any) => (
                  <div key={endpoint._id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{endpoint.name}</p>
                        <p className="text-xs text-muted-foreground">{endpoint.url}</p>
                      </div>
                    </div>
                    <Badge variant={endpoint.status === 'active' ? 'success' : 'destructive'}>
                      {endpoint.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Platform</span>
              <span className="font-medium">SwarmUI v1.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Auth Method</span>
              <Badge variant="secondary">Local</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">API Status</span>
              <Badge variant="success">Online</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

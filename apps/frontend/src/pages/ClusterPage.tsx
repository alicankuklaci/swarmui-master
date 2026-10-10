import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SwarmPage } from '@/pages/SwarmPage';
import { NodesPage } from '@/pages/NodesPage';
import { ClusterVisualizerPage } from '@/pages/ClusterVisualizerPage';

/**
 * Unified /cluster page: Overview (swarm status) / Nodes (list + actions) /
 * Topology (visualizer). Reuses the existing pages inside Radix tabs; the
 * active tab persists in `?tab=`. Legacy /swarm, /nodes, /visualizer still
 * work via redirect in App.tsx.
 */
const TABS = ['overview', 'nodes', 'topology'] as const;
type TabKey = (typeof TABS)[number];

export function ClusterPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'overview';

  function onChange(next: string) {
    const n = new URLSearchParams(params);
    n.set('tab', next);
    setParams(n, { replace: true });
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Cluster"
        description="Swarm overview, node management, and topology view in one place."
      />
      <Tabs value={tab} onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="topology">Topology</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><SwarmPage /></TabsContent>
        <TabsContent value="nodes"><NodesPage /></TabsContent>
        <TabsContent value="topology"><ClusterVisualizerPage /></TabsContent>
      </Tabs>
    </div>
  );
}

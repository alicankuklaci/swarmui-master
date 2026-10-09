import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Container as ContainerIcon } from 'lucide-react';
import { useContainers } from '@/hooks/useMonitoring';
import { formatBytes } from '@/lib/utils';

export function ContainersMonitoringPage() {
  const [sort, setSort] = useState<'cpu' | 'mem'>('cpu');
  const [refreshMs, setRefreshMs] = useState(30_000);
  const query = useContainers({ sort, limit: 50 }, refreshMs);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Container Monitoring"
        description="Top containers across all nodes, refreshed every 30s (5s in live view)."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant={sort === 'cpu' ? 'default' : 'outline'} onClick={() => setSort('cpu')}>By CPU</Button>
            <Button size="sm" variant={sort === 'mem' ? 'default' : 'outline'} onClick={() => setSort('mem')}>By Memory</Button>
            <Button
              size="sm"
              variant={refreshMs === 5000 ? 'default' : 'outline'}
              onClick={() => setRefreshMs(refreshMs === 5000 ? 30_000 : 5000)}
            >
              {refreshMs === 5000 ? 'Live (5s)' : 'Enable live view'}
            </Button>
          </div>
        }
      />
      <AsyncView
        query={query}
        empty={<EmptyState icon={ContainerIcon} title="No containers reporting" message="Wait a sampling cycle after a fresh install." />}
      >
        {(rows: any[]) => (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2">Container</th>
                  <th className="p-2">Node</th>
                  <th className="p-2">Stack</th>
                  <th className="p-2 text-right">CPU %</th>
                  <th className="p-2 text-right">Mem %</th>
                  <th className="p-2 text-right">Mem used</th>
                  <th className="p-2 text-right">Net ↓/↑</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.containerId} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-medium">
                      <Link to={`/monitoring/containers/${r.containerId}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.nodeId}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.stackName || '—'}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{(r.cpuPct ?? 0).toFixed(1)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{(r.memUsedPct ?? 0).toFixed(1)}</td>
                    <td className="p-2 text-right font-mono text-xs">{formatBytes(r.memUsedBytes ?? 0)}</td>
                    <td className="p-2 text-right font-mono text-xs">
                      {formatBytes(r.netRxBps ?? 0)}/s · {formatBytes(r.netTxBps ?? 0)}/s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
    </div>
  );
}

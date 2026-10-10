import { Link } from 'react-router-dom';
import { Activity, Cpu, HardDrive, Server, Container as ContainerIcon, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNodeList, useContainers, useFiringCount, nodeDisplay } from '@/hooks/useMonitoring';
import { cn, formatBytes } from '@/lib/utils';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { useUrlSearch } from '@/hooks/useUrlSearch';

const REFRESH_MS = 5_000;

function MeterBar({ label, value, warnAt = 75, critAt = 90 }: { label: string; value: number; warnAt?: number; critAt?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const colour = pct >= critAt ? 'bg-red-500' : pct >= warnAt ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-mono tabular-nums', pct >= critAt && 'text-red-600 font-semibold')}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded overflow-hidden">
        <div className={cn('h-full transition-all', colour)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FiringBanner() {
  const { data } = useFiringCount();
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 p-3 text-sm flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" />
      <span><strong>{count}</strong> alarm{count === 1 ? '' : 's'} firing.</span>
      <Link to="/monitoring/alarms" className="ml-auto underline">View →</Link>
    </div>
  );
}

export function LiveMonitoringPage() {
  const [sort, setSort] = useState<'cpu' | 'mem'>('cpu');
  const nodesQuery = useNodeList(REFRESH_MS);
  const containersQuery = useContainers({ sort, limit: 20 }, REFRESH_MS);
  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Live Monitoring"
        description="All nodes + top containers, refreshed every 5 seconds."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              5s refresh
            </Badge>
          </div>
        }
      />

      <FiringBanner />

      {/* Node grid */}
      <AsyncView
        query={nodesQuery}
        empty={<EmptyState icon={Server} title="No node samples yet" message="Give the collector 30-60 seconds after a fresh deploy." />}
      >
        {(nodes: any[]) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((n) => {
              const maxDisk = Math.max(0, ...((n.disk || []).map((d: any) => d.usedPct)));
              return (
                <Card key={n.nodeId}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base flex items-center gap-2 min-w-0">
                      <Server className="w-4 h-4 text-primary flex-shrink-0" />
                      <Link
                        to={`/monitoring/nodes/${encodeURIComponent(n.nodeId)}`}
                        className="hover:underline truncate"
                        title={n.nodeId}
                      >
                        {nodeDisplay(n)}
                      </Link>
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {n.containers?.running ?? 0} up
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <MeterBar label="CPU" value={n.cpu?.usagePct ?? 0} warnAt={75} critAt={90} />
                    <MeterBar label="RAM" value={n.mem?.usedPct ?? 0} warnAt={80} critAt={92} />
                    <MeterBar label="Disk" value={maxDisk} warnAt={85} critAt={95} />
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />{n.cpu?.cores ?? 0} cores</div>
                      <div className="flex items-center gap-1"><Activity className="w-3 h-3" />load {(n.cpu?.loadavg?.[0] ?? 0).toFixed(2)}</div>
                      <div className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{formatBytes(n.mem?.totalBytes ?? 0)}</div>
                      <div className="flex items-center gap-1">↓{formatBytes(n.net?.rxBps ?? 0)}/s · ↑{formatBytes(n.net?.txBps ?? 0)}/s</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </AsyncView>

      {/* Live container table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ContainerIcon className="w-4 h-4" />
            Top containers (live)
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={sort === 'cpu' ? 'default' : 'outline'} onClick={() => setSort('cpu')}>By CPU</Button>
            <Button size="sm" variant={sort === 'mem' ? 'default' : 'outline'} onClick={() => setSort('mem')}>By Memory</Button>
          </div>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="Search containers, images, stacks, or node" />

        <AsyncView
          query={containersQuery}
          empty={<EmptyState icon={ContainerIcon} title="No containers reporting" message="Metric collector hasn't sampled yet." />}
        >
          {(allRows: any[]) => {
            const rows = needle
              ? allRows.filter((r) =>
                  (r.name || '').toLowerCase().includes(needle) ||
                  (r.image || '').toLowerCase().includes(needle) ||
                  (r.stackName || '').toLowerCase().includes(needle) ||
                  nodeDisplay(r).toLowerCase().includes(needle),
                )
              : allRows;
            return (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase">
                  <tr>
                    <th className="p-2">Container</th>
                    <th className="p-2">Node</th>
                    <th className="p-2">Stack</th>
                    <th className="p-2 text-right">CPU %</th>
                    <th className="p-2 text-right">Mem %</th>
                    <th className="p-2 text-right">Mem used</th>
                    <th className="p-2 text-right">Net ↓/↑ (B/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cpuCls = r.cpuPct >= 90 ? 'text-red-600 font-semibold' : r.cpuPct >= 75 ? 'text-amber-600' : '';
                    const memCls = r.memUsedPct >= 92 ? 'text-red-600 font-semibold' : r.memUsedPct >= 80 ? 'text-amber-600' : '';
                    return (
                      <tr key={r.containerId} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-medium">
                          <Link to={`/monitoring/containers/${r.containerId}`} className="hover:underline">{r.name}</Link>
                        </td>
                        <td className="p-2 text-xs" title={r.nodeId}>{nodeDisplay(r)}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.stackName ?? '—'}</td>
                        <td className={cn('p-2 text-right font-mono tabular-nums', cpuCls)}>{r.cpuPct?.toFixed(1)}</td>
                        <td className={cn('p-2 text-right font-mono tabular-nums', memCls)}>{r.memUsedPct?.toFixed(1)}</td>
                        <td className="p-2 text-right font-mono tabular-nums text-xs">{formatBytes(r.memUsedBytes ?? 0)}</td>
                        <td className="p-2 text-right font-mono tabular-nums text-xs text-muted-foreground">
                          {formatBytes(r.netRxBps ?? 0)} / {formatBytes(r.netTxBps ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            );
          }}
        </AsyncView>
      </div>
    </div>
  );
}

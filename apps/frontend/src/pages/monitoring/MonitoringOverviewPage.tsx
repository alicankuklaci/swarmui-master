import { Link } from 'react-router-dom';
import { Activity, Cpu, HardDrive, Server, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNodeList, useFiringCount, nodeDisplay } from '@/hooks/useMonitoring';
import { cn, formatBytes } from '@/lib/utils';

function FiringAlarmBanner() {
  const { data } = useFiringCount();
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 p-3 text-sm flex items-center gap-2"
    >
      <AlertTriangle className="w-4 h-4" />
      <span>
        <strong>{count}</strong> alarm{count === 1 ? '' : 's'} currently firing.
      </span>
      <Link to="/monitoring/alarms" className="ml-auto underline hover:no-underline">
        View alarms →
      </Link>
    </div>
  );
}

interface Bar { label: string; value: number; warnAt?: number; critAt?: number }

function MeterBar({ label, value, warnAt = 75, critAt = 90 }: Bar) {
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

export function MonitoringOverviewPage() {
  const query = useNodeList();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Monitoring"
        description="Live resource usage across every Swarm node. Click a card for time-series."
      />

      <FiringAlarmBanner />

      <AsyncView
        query={query}
        empty={
          <EmptyState
            icon={Server}
            title="No node samples yet"
            message="The metrics collector polls every 30s. Give it a minute after a fresh deploy."
          />
        }
      >
        {(nodes: any[]) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((n) => {
              const maxDisk = Math.max(0, ...((n.disk || []).map((d: any) => d.usedPct)));
              return (
                <Card key={n.nodeId} className="hover:shadow-md transition-shadow">
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
                    <MeterBar label="Disk (worst mount)" value={maxDisk} warnAt={85} critAt={95} />
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />{n.cpu?.cores ?? 0} cores</div>
                      <div className="flex items-center gap-1"><Activity className="w-3 h-3" />load {(n.cpu?.loadavg?.[0] ?? 0).toFixed(2)}</div>
                      <div className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{formatBytes(n.mem?.totalBytes ?? 0)}</div>
                      <div className="flex items-center gap-1">
                        ↓{formatBytes(n.net?.rxBps ?? 0)}/s · ↑{formatBytes(n.net?.txBps ?? 0)}/s
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </AsyncView>
    </div>
  );
}

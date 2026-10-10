import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAlarms, useAckAlarm, Alarm } from '@/hooks/useMonitoring';
import { formatDate, cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { useUrlSearch } from '@/hooks/useUrlSearch';

function sevIcon(s: Alarm['severity']) {
  if (s === 'critical') return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (s === 'warning') return <AlertCircle className="w-4 h-4 text-amber-500" />;
  return <Info className="w-4 h-4 text-blue-500" />;
}

function sevBadge(s: Alarm['severity']) {
  const map: any = { critical: 'destructive', warning: 'warning', info: 'default' };
  return <Badge variant={map[s] || 'default'}>{s}</Badge>;
}

export function AlarmsPage() {
  const [status, setStatus] = useState<'firing' | 'resolved' | undefined>(undefined);
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const query = useAlarms({ status, severity, limit: 100 });
  const ackMut = useAckAlarm();
  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Alarms"
        description="Firing and recently resolved alarms. 7-day retention."
        actions={
          <div className="flex gap-1 items-center">
            <Button size="sm" variant={!status ? 'default' : 'outline'} onClick={() => setStatus(undefined)}>All</Button>
            <Button size="sm" variant={status === 'firing' ? 'default' : 'outline'} onClick={() => setStatus('firing')}>Firing</Button>
            <Button size="sm" variant={status === 'resolved' ? 'default' : 'outline'} onClick={() => setStatus('resolved')}>Resolved</Button>
            <span className="mx-2 h-5 border-l" />
            <Button size="sm" variant={!severity ? 'default' : 'outline'} onClick={() => setSeverity(undefined)}>Any sev</Button>
            <Button size="sm" variant={severity === 'critical' ? 'destructive' : 'outline'} onClick={() => setSeverity('critical')}>Critical</Button>
            <Button size="sm" variant={severity === 'warning' ? 'default' : 'outline'} onClick={() => setSeverity('warning')}>Warning</Button>
          </div>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by rule, node, stack, or container"
      />

      <AsyncView
        query={query}
        empty={<EmptyState icon={Bell} title="No alarms match" message="Try widening your filters, or enable preset rules at /monitoring/rules." />}
      >
        {(allRows: Alarm[]) => {
          const rows = needle
            ? allRows.filter((a) =>
                (a.ruleName || '').toLowerCase().includes(needle) ||
                (a.target?.nodeId || '').toLowerCase().includes(needle) ||
                ((a.target as any)?.nodeHostname || '').toLowerCase().includes(needle) ||
                (a.target?.stackName || '').toLowerCase().includes(needle) ||
                (a.target?.containerId || '').toLowerCase().includes(needle),
              )
            : allRows;
          return (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Rule</th>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Target</th>
                  <th className="p-2 text-right">Value</th>
                  <th className="p-2">Fired at</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a._id} className={cn('border-t hover:bg-muted/30', a.status === 'firing' && 'bg-red-50/40 dark:bg-red-900/10')}>
                    <td className="p-2">{sevIcon(a.severity)}</td>
                    <td className="p-2 font-medium">
                      <Link to={`/monitoring/alarms/${a._id}`} className="hover:underline">
                        {a.ruleName}
                      </Link>
                    </td>
                    <td className="p-2">{sevBadge(a.severity)}</td>
                    <td className="p-2">
                      <Badge variant={a.status === 'firing' ? 'destructive' : 'outline'}>{a.status}</Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {a.target?.nodeId && (
                        <div title={a.target.nodeId}>
                          node: {(a.target as any).nodeHostname || a.target.nodeId.slice(0, 12) + '…'}
                        </div>
                      )}
                      {a.target?.containerId && <div>cnt: {a.target.containerId.slice(0, 12)}</div>}
                      {a.target?.stackName && <div>stack: {a.target.stackName}</div>}
                      {a.target?.uptimeCheckId && <div>check: {a.target.uptimeCheckId}</div>}
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums text-xs">
                      {Number(a.value).toFixed(1)} / {Number(a.threshold).toFixed(1)}
                    </td>
                    <td className="p-2 text-xs">{formatDate(a.firedAt)}</td>
                    <td className="p-2">
                      {!a.acknowledgedAt && a.status === 'firing' && (
                        <Button
                          size="sm" variant="ghost"
                          disabled={ackMut.isPending}
                          onClick={() => ackMut.mutate(a._id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {a.acknowledgedAt && <Badge variant="outline">acked</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        }}
      </AsyncView>
    </div>
  );
}

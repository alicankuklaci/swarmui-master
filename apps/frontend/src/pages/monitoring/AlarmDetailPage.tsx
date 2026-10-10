import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAlarm } from '@/hooks/useMonitoring';
import { formatDate } from '@/lib/utils';

export function AlarmDetailPage() {
  const { id = '' } = useParams();
  const query = useAlarm(id);

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Alarm detail" back={{ to: '/monitoring/alarms', label: 'All alarms' }} />
      <AsyncView query={query}>
        {(a: any) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{a.ruleName}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><strong>Severity:</strong> <Badge variant={a.severity === 'critical' ? 'destructive' : 'default'}>{a.severity}</Badge></div>
                <div><strong>Status:</strong> <Badge variant={a.status === 'firing' ? 'destructive' : 'outline'}>{a.status}</Badge></div>
                <div><strong>Fired at:</strong> {formatDate(a.firedAt)}</div>
                {a.resolvedAt && <div><strong>Resolved at:</strong> {formatDate(a.resolvedAt)}</div>}
                <div><strong>Value / Threshold:</strong> <code>{Number(a.value).toFixed(2)} / {Number(a.threshold).toFixed(2)}</code></div>
                <div>
                  <strong>Target:</strong>{' '}
                  {a.target?.nodeId && (
                    <span title={a.target.nodeId}>
                      <code>{a.target.nodeHostname || a.target.nodeId.slice(0, 12) + '…'}</code>
                      {a.target.containerId && <> · container <code>{a.target.containerId.slice(0, 12)}…</code></>}
                      {a.target.stackName && <> · stack <code>{a.target.stackName}</code></>}
                    </span>
                  )}
                  {!a.target?.nodeId && a.target?.stackName && <code>stack {a.target.stackName}</code>}
                  {!a.target?.nodeId && !a.target?.stackName && a.target?.uptimeCheckId && <code>uptime check</code>}
                  {!a.target?.nodeId && !a.target?.stackName && !a.target?.uptimeCheckId && <span className="text-muted-foreground">—</span>}
                </div>
                {a.acknowledgedAt && <div><strong>Acknowledged at:</strong> {formatDate(a.acknowledgedAt)}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Snapshot at fire time</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {a.snapshot?.nodeState && (
                  <div>
                    <h4 className="font-medium mb-1">Node state</h4>
                    <div className="font-mono text-xs">
                      CPU {a.snapshot.nodeState.cpuPct?.toFixed(1)}% · RAM {a.snapshot.nodeState.memUsedPct?.toFixed(1)}% · Disk {a.snapshot.nodeState.diskUsedPct?.toFixed(1)}%
                    </div>
                  </div>
                )}
                {a.snapshot?.topContainersCpu?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Top CPU</h4>
                    <ul className="font-mono text-xs space-y-0.5">
                      {a.snapshot.topContainersCpu.map((c: any) => (
                        <li key={c.name}>{c.name} — {Number(c.cpuPct).toFixed(1)}%</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.snapshot?.topContainersMem?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Top Memory</h4>
                    <ul className="font-mono text-xs space-y-0.5">
                      {a.snapshot.topContainersMem.map((c: any) => (
                        <li key={c.name}>{c.name} — {Number(c.memUsedPct).toFixed(1)}%</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Delivery log</CardTitle></CardHeader>
              <CardContent>
                {!a.notifiedChannels?.length ? (
                  <p className="text-sm text-muted-foreground">No channels were notified.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left">
                      <tr><th className="p-2">Channel</th><th className="p-2">Success</th><th className="p-2">Error</th><th className="p-2">At</th></tr>
                    </thead>
                    <tbody>
                      {a.notifiedChannels.map((n: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 font-mono text-xs">{String(n.channelId).slice(0, 8)}…</td>
                          <td className="p-2">{n.success ? <Badge>ok</Badge> : <Badge variant="destructive">fail</Badge>}</td>
                          <td className="p-2 text-xs text-muted-foreground">{n.error || '—'}</td>
                          <td className="p-2 text-xs">{formatDate(n.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AsyncView>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUptimeHistory } from '@/hooks/useUptimeChecks';

type Range = '1h' | '24h' | '7d';

export function UptimeCheckDetailPage() {
  const { id = '' } = useParams();
  const [range, setRange] = useState<Range>('24h');

  const { from, to } = useMemo(() => {
    const to = new Date();
    const h = range === '1h' ? 1 : range === '24h' ? 24 : 24 * 7;
    return { from: new Date(to.getTime() - h * 3600_000), to };
  }, [range]);

  const q = useUptimeHistory(id, from, to);

  const chart = useMemo(() => {
    if (!q.data) return [];
    return q.data.map((r: any) => ({
      ts: new Date(r.ts).getTime(),
      ms: r.responseMs,
      up: r.status === 'up' ? r.responseMs : null,
      down: r.status === 'down' ? r.responseMs : null,
      httpStatus: r.httpStatus,
      error: r.error,
    }));
  }, [q.data]);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Uptime check history"
        back={{ to: '/monitoring/uptime', label: 'All checks' }}
        actions={
          <div className="flex gap-1">
            {(['1h', '24h', '7d'] as Range[]).map((r) => (
              <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)}>
                {r}
              </Button>
            ))}
          </div>
        }
      />
      <AsyncView query={q}>
        {() => (
          <Card>
            <CardHeader><CardTitle className="text-sm">Response time (ms)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="ts" type="number" scale="time" domain={['auto', 'auto']}
                      tickFormatter={(v) => new Date(v).toLocaleTimeString()} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip labelFormatter={(v: any) => new Date(v).toLocaleString()} />
                    <Line type="monotone" dataKey="up" stroke="#059669" dot={false} name="Up" />
                    <Line type="monotone" dataKey="down" stroke="#dc2626" dot={{ r: 4 }} name="Down" />
                    <ReferenceLine y={1000} stroke="#f59e0b" strokeDasharray="4 2" label="1s" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </AsyncView>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useContainerMetrics } from '@/hooks/useMonitoring';
import { formatBytes } from '@/lib/utils';

type Range = '1h' | '24h' | '7d';

export function ContainerDetailPage() {
  const { id = '' } = useParams();
  const [range, setRange] = useState<Range>('1h');

  const { from, to } = useMemo(() => {
    const to = new Date();
    const h = range === '1h' ? 1 : range === '24h' ? 24 : 24 * 7;
    return { from: new Date(to.getTime() - h * 3600_000), to };
  }, [range]);

  const seriesQ = useContainerMetrics(id, from, to);

  const chartData = useMemo(() => {
    if (!seriesQ.data) return [];
    return seriesQ.data.map((d: any) => ({
      ts: new Date(d.ts).getTime(),
      cpu: d.cpuPct ?? 0,
      mem: d.memUsedPct ?? 0,
      memBytes: d.memUsedBytes ?? 0,
      netRx: d.netRxBps ?? 0,
      netTx: d.netTxBps ?? 0,
    }));
  }, [seriesQ.data]);

  const headerName = seriesQ.data?.[0]?.name || id;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Container: ${headerName}`}
        description={id}
        back={{ to: '/monitoring/containers', label: 'All containers' }}
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

      <AsyncView query={seriesQ}>
        {() => (
          <>
            <SmallChart title="CPU (%)" data={chartData} dataKey="cpu" colour="#2563eb" />
            <SmallChart title="Memory (%)" data={chartData} dataKey="mem" colour="#059669" />
            <SmallChart title="Memory (bytes)" data={chartData} dataKey="memBytes" colour="#8b5cf6" fmt={(v) => formatBytes(v)} />
            <SmallChart title="Network RX (B/s)" data={chartData} dataKey="netRx" colour="#ec4899" fmt={(v) => formatBytes(v) + '/s'} />
            <SmallChart title="Network TX (B/s)" data={chartData} dataKey="netTx" colour="#f59e0b" fmt={(v) => formatBytes(v) + '/s'} />
          </>
        )}
      </AsyncView>
    </div>
  );
}

function SmallChart({ title, data, dataKey, colour, fmt }: {
  title: string; data: any[]; dataKey: string; colour: string; fmt?: (v: number) => string;
}) {
  const formatter = fmt || ((v: number) => `${v.toFixed(1)}%`);
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`g-c-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colour} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={colour} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="ts" type="number" scale="time" domain={['auto', 'auto']}
                tickFormatter={(v) => new Date(v).toLocaleTimeString()} fontSize={11} />
              <YAxis tickFormatter={formatter} fontSize={11} width={70} />
              <Tooltip
                labelFormatter={(v: any) => new Date(v).toLocaleString()}
                formatter={(v: any) => formatter(v as number)}
              />
              <Area type="monotone" dataKey={dataKey} stroke={colour} fill={`url(#g-c-${dataKey})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

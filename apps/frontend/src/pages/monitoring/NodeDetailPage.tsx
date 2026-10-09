import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useNodeMetrics, useContainers } from '@/hooks/useMonitoring';
import { formatBytes } from '@/lib/utils';

type Range = '1h' | '24h' | '7d';

export function NodeDetailPage() {
  const { nodeId = '' } = useParams();
  const [range, setRange] = useState<Range>('1h');

  const { from, to } = useMemo(() => {
    const to = new Date();
    const h = range === '1h' ? 1 : range === '24h' ? 24 : 24 * 7;
    return { from: new Date(to.getTime() - h * 3600_000), to };
  }, [range]);

  const seriesQ = useNodeMetrics(nodeId, from, to);
  const containersQ = useContainers({ nodeId, sort: 'cpu', limit: 20 });

  const chartData = useMemo(() => {
    if (!seriesQ.data) return [];
    return seriesQ.data.map((d: any) => ({
      ts: new Date(d.ts).getTime(),
      cpu: d.cpu?.usagePct ?? 0,
      mem: d.mem?.usedPct ?? 0,
      disk: Math.max(0, ...((d.disk || []).map((x: any) => x.usedPct))),
      rxBps: d.net?.rxBps ?? 0,
      txBps: d.net?.txBps ?? 0,
    }));
  }, [seriesQ.data]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Node: ${nodeId}`}
        description="Time-series resource usage · last probe snapshot · top containers"
        back={{ to: '/monitoring', label: 'All nodes' }}
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

      <Tabs defaultValue="charts">
        <TabsList>
          <TabsTrigger value="charts">Time-series</TabsTrigger>
          <TabsTrigger value="containers">Top containers</TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="space-y-4 mt-4">
          <AsyncView query={seriesQ}>
            {() => (
              <>
                <ChartCard title="CPU (%)" data={chartData} dataKey="cpu" colour="#2563eb" domain={[0, 100]} />
                <ChartCard title="Memory (%)" data={chartData} dataKey="mem" colour="#059669" domain={[0, 100]} />
                <ChartCard title="Disk worst-mount (%)" data={chartData} dataKey="disk" colour="#d97706" domain={[0, 100]} />
                <ChartCard
                  title="Network (B/s)"
                  data={chartData}
                  dataKey="rxBps"
                  secondaryKey="txBps"
                  colour="#8b5cf6"
                  colourSecondary="#ec4899"
                  format="bytes"
                />
              </>
            )}
          </AsyncView>
        </TabsContent>

        <TabsContent value="containers" className="mt-4">
          <AsyncView query={containersQ}>
            {(rows: any[]) => (
              <Card>
                <CardHeader><CardTitle>Current top 20 by CPU</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left">
                      <tr>
                        <th className="p-2">Container</th>
                        <th className="p-2">Image</th>
                        <th className="p-2 text-right">CPU %</th>
                        <th className="p-2 text-right">Mem %</th>
                        <th className="p-2 text-right">Mem used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.containerId} className="border-t">
                          <td className="p-2 font-medium">{r.name}</td>
                          <td className="p-2 text-muted-foreground text-xs truncate max-w-[300px]">{r.image}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{(r.cpuPct ?? 0).toFixed(1)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{(r.memUsedPct ?? 0).toFixed(1)}</td>
                          <td className="p-2 text-right font-mono text-xs">{formatBytes(r.memUsedBytes ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </AsyncView>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  data: any[];
  dataKey: string;
  secondaryKey?: string;
  colour: string;
  colourSecondary?: string;
  domain?: [number, number];
  format?: 'percent' | 'bytes';
}

function ChartCard({ title, data, dataKey, secondaryKey, colour, colourSecondary, domain, format }: ChartCardProps) {
  const fmt = format === 'bytes' ? (v: number) => formatBytes(v) + '/s' : (v: number) => `${v.toFixed(1)}%`;
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colour} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={colour} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['auto', 'auto']}
                tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                fontSize={11}
              />
              <YAxis domain={domain ?? ['auto', 'auto']} tickFormatter={fmt} fontSize={11} width={70} />
              <Tooltip
                labelFormatter={(v: any) => new Date(v).toLocaleString()}
                formatter={(v: any) => fmt(v as number)}
              />
              <Area type="monotone" dataKey={dataKey} stroke={colour} fill={`url(#g-${dataKey})`} />
              {secondaryKey && colourSecondary && (
                <Area type="monotone" dataKey={secondaryKey} stroke={colourSecondary} fill="none" />
              )}
              {data.length > 20 && <Brush dataKey="ts" height={20} tickFormatter={(v) => new Date(v).toLocaleTimeString()} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

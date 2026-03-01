import { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

interface StatPoint {
  time: string;
  cpu: number;
  memPercent: number;
  netRx: number;
  netTx: number;
}

interface StatsChartProps {
  endpointId: string;
  containerId: string;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

export function StatsChart({ endpointId, containerId, className }: StatsChartProps) {
  const [data, setData] = useState<StatPoint[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `/api/endpoints/${endpointId}/containers/${containerId}/stats`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const stats = JSON.parse(e.data);
        setCurrent(stats);
        const time = new Date(stats.timestamp).toLocaleTimeString();
        setData((prev) => [
          ...prev.slice(-30),
          {
            time,
            cpu: stats.cpu.percent,
            memPercent: stats.memory.percent,
            netRx: stats.network.rxBytes,
            netTx: stats.network.txBytes,
          },
        ]);
      } catch {}
    };

    es.onerror = () => es.close();

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [endpointId, containerId]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Current stats summary */}
      {current && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">CPU</div>
            <div className="text-xl font-bold">{current.cpu.percent.toFixed(1)}%</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Memory</div>
            <div className="text-xl font-bold">{current.memory.percent.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">
              {formatBytes(current.memory.usage)} / {formatBytes(current.memory.limit)}
            </div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Net RX</div>
            <div className="text-xl font-bold">{formatBytes(current.network.rxBytes)}</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Net TX</div>
            <div className="text-xl font-bold">{formatBytes(current.network.txBytes)}</div>
          </div>
        </div>
      )}

      {/* CPU/Memory chart */}
      <div className="bg-card rounded-lg p-4 border">
        <h4 className="text-sm font-medium mb-3">CPU & Memory Usage (%)</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
            <Legend />
            <Line type="monotone" dataKey="cpu" name="CPU %" stroke="#3b82f6" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="memPercent" name="Memory %" stroke="#10b981" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

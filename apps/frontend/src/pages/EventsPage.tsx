import { Component, type ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app.store';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

class EventsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; msg: string }> {
  state = { hasError: false, msg: '' };
  static getDerivedStateFromError(e: Error) { return { hasError: true, msg: e?.message ?? '' }; }
  render() {
    if (this.state.hasError)
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <p>Events yüklenemedi: {this.state.msg}</p>
          <button className="underline text-sm" onClick={() => this.setState({ hasError: false, msg: '' })}>Tekrar dene</button>
        </div>
      );
    return this.props.children;
  }
}

const actionColors: Record<string, string> = {
  start: 'bg-green-500/10 text-green-600',
  stop: 'bg-red-500/10 text-red-600',
  die: 'bg-red-500/10 text-red-600',
  create: 'bg-blue-500/10 text-blue-600',
  destroy: 'bg-orange-500/10 text-orange-600',
  connect: 'bg-green-500/10 text-green-600',
};

function EventsInner() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['events', endpointId, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '100' };
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await api.get(`/endpoints/${endpointId}/events`, { params });
      const raw = res.data?.data ?? res.data ?? [];
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!endpointId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-muted-foreground">Docker engine event log</p>
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="container">Container</SelectItem>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="network">Network</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="node">Node</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3">Time</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No events</td></tr>
            ) : events.map((ev: any, i: number) => (
              <tr key={i} className="border-b hover:bg-muted/20">
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {ev.time ? new Date(ev.time * 1000).toLocaleString() : '-'}
                </td>
                <td className="p-3"><Badge variant="outline" className="text-xs">{ev.Type ?? ev.type ?? '-'}</Badge></td>
                <td className="p-3">
                  <Badge variant="outline" className={`text-xs ${actionColors[ev.Action ?? ev.action] ?? ''}`}>
                    {ev.Action ?? ev.action ?? '-'}
                  </Badge>
                </td>
                <td className="p-3 font-mono text-xs truncate max-w-xs">
                  {ev.Actor?.Attributes?.name ?? ev.from ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EventsPage() {
  return <EventsErrorBoundary><EventsInner /></EventsErrorBoundary>;
}

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Trash2, PauseCircle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

interface LogEntry {
  type: 'stdout' | 'stderr';
  text: string;
}

interface LogViewerProps {
  endpointId: string;
  containerId: string;
  tail?: number;
  className?: string;
  resourceType?: 'container' | 'service';
  /** Direct agent URL for remote swarm nodes e.g. http://10.0.0.11:9001 */
  agentUrl?: string;
}

export function LogViewer({ endpointId, containerId, tail = 200, className, resourceType = 'container', agentUrl }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const token = useAuthStore.getState().accessToken || '';
    const AGENT_TOKEN = 'supersecret';
    let url: string;
    if (agentUrl) {
      // Direct connection to node agent (Docker API proxy)
      url = `${agentUrl}/containers/${containerId}/logs?stdout=1&stderr=1&tail=${tail}&follow=1`;
    } else {
      const basePath = resourceType === 'service'
        ? `/api/v1/endpoints/${endpointId}/swarm/services/${containerId}/logs`
        : `/api/v1/endpoints/${endpointId}/containers/${containerId}/logs`;
      url = `${basePath}?tail=${tail}&follow=true${token ? '&token=' + encodeURIComponent(token) : ''}`;
    }

    // SSE doesn't support custom headers, so we use query params for auth
    const finalUrl = agentUrl
      ? `${url}&token=${encodeURIComponent(AGENT_TOKEN)}`
      : url;
    const es = new EventSource(finalUrl);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      if (pausedRef.current) return;
      if (!e.data || e.data === '') return;
      try {
        const data = JSON.parse(e.data);
        const logData = data.data ?? data;
        setLogs((prev) => [...prev.slice(-2000), typeof logData === 'object' && logData.text ? logData : { type: 'stdout', text: typeof logData === 'string' ? logData : JSON.stringify(logData) }]);
      } catch {
        setLogs((prev) => [...prev.slice(-2000), { type: 'stdout', text: e.data }]);
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [endpointId, containerId, tail]);

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, paused]);

  const handleDownload = () => {
    const text = logs.map((l) => l.text).join('');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${containerId.slice(0, 12)}-logs.txt`;
    a.click();
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')} />
          <span className="text-sm text-muted-foreground">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
            {paused ? <PlayCircle className="w-4 h-4 mr-1" /> : <PauseCircle className="w-4 h-4 mr-1" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLogs([])}>
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-1" /> Download
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-gray-950 text-gray-100 rounded-lg p-3 font-mono text-xs overflow-y-auto min-h-64 max-h-96">
        {logs.length === 0 && (
          <span className="text-gray-500">No logs yet...</span>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className={cn('whitespace-pre-wrap break-all', log.type === 'stderr' && 'text-red-400')}
          >
            {log.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

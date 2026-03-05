import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import '@xterm/xterm/css/xterm.css';
import { cn } from '@/lib/utils';

interface ContainerConsoleProps {
  endpointId: string;
  containerId: string;
  cmd?: string[];
  className?: string;
  agentUrl?: string;
}

export function ContainerConsole({ endpointId, containerId, cmd, className, agentUrl }: ContainerConsoleProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error' | 'disconnected'>('connecting');

  useEffect(() => {
    if (!termRef.current) return;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    // For remote swarm nodes, connect to agent's WebSocket proxy
    const socketUrl = agentUrl || '';
    const socketPath = agentUrl ? '/socket.io' : '/socket.io';
    const socket = io(agentUrl ? agentUrl : '/docker', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: useAuthStore.getState().accessToken || '' },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('exec:start', {
        containerId,
        cmd: cmd || ['/bin/sh'],
        endpointId,
        agentUrl: agentUrl || undefined,
      });
    });

    socket.on('exec:ready', () => {
      setStatus('ready');
      term.write('\r\n\x1b[32m✓ Connected\x1b[0m\r\n');
    });

    socket.on('exec:data', (data: string) => {
      term.write(data);
    });

    socket.on('exec:end', () => {
      setStatus('disconnected');
      term.write('\r\n\x1b[33mSession ended\x1b[0m\r\n');
    });

    socket.on('exec:error', (msg: string) => {
      setStatus('error');
      term.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`);
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    // Send input from terminal to server
    term.onData((data) => {
      socket.emit('exec:input', data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      socket.emit('exec:resize', {
        containerId,
        cols: term.cols,
        rows: term.rows,
      });
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      socket.disconnect();
      term.dispose();
      xtermRef.current = null;
      socketRef.current = null;
    };
  }, [containerId, endpointId]);

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            status === 'ready' && 'bg-green-500',
            status === 'connecting' && 'bg-yellow-500 animate-pulse',
            status === 'error' && 'bg-red-500',
            status === 'disconnected' && 'bg-gray-500',
          )}
        />
        <span className="text-xs text-muted-foreground capitalize">{status}</span>
      </div>
      <div
        ref={termRef}
        className="rounded-lg overflow-hidden border border-gray-800"
        style={{ height: '400px' }}
      />
    </div>
  );
}

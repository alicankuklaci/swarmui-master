import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAppMutation } from './useAppMutation';

export interface NodeSample {
  _id: string;
  nodeId: string;
  /** Human-readable hostname. May be absent on legacy samples; display must fall back to nodeId. */
  nodeHostname?: string;
  ts: string;
  cpu: { usagePct: number; cores: number; loadavg: number[] };
  mem: { usedBytes: number; totalBytes: number; usedPct: number };
  disk: Array<{ mount: string; usedBytes: number; totalBytes: number; usedPct: number }>;
  net: { rxBps: number; txBps: number };
  containers: { running: number; stopped: number; total: number };
}

export interface ContainerSample {
  _id: string;
  nodeId: string;
  /** Human-readable hostname of the node this container ran on. */
  nodeHostname?: string;
  containerId: string;
  name: string;
  image: string;
  stackName?: string;
  ts: string;
  cpuPct: number;
  memUsedBytes: number;
  memLimitBytes: number;
  memUsedPct: number;
  netRxBps: number;
  netTxBps: number;
}

export interface Alarm {
  _id: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved';
  firedAt: string;
  resolvedAt?: string;
  value: number;
  threshold: number;
  target: { nodeId?: string; nodeHostname?: string; containerId?: string; stackName?: string; uptimeCheckId?: string };
  snapshot?: any;
  notifiedChannels?: any[];
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/** Returns a short display label: hostname when known, else first 12 chars of nodeId. */
export function nodeDisplay(sample: { nodeHostname?: string; nodeId: string }): string {
  if (sample.nodeHostname) return sample.nodeHostname;
  return (sample.nodeId || '').slice(0, 12) || '—';
}

export function useNodeList(refetchMs = 30_000) {
  return useQuery({
    queryKey: ['monitoring', 'nodes'],
    queryFn: () => api.get('/monitoring/nodes').then((r) => unwrap<NodeSample[]>(r)),
    refetchInterval: refetchMs,
  });
}

export function useNodeMetrics(nodeId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['monitoring', 'node-metrics', nodeId, from.toISOString(), to.toISOString()],
    queryFn: () => api.get(`/monitoring/nodes/${nodeId}/metrics`, {
      params: { from: from.toISOString(), to: to.toISOString() },
    }).then((r) => unwrap<NodeSample[]>(r)),
    enabled: !!nodeId,
    refetchInterval: 60_000,
  });
}

export function useContainers(opts: { nodeId?: string; sort?: 'cpu' | 'mem'; limit?: number } = {}, refetchMs = 30_000) {
  return useQuery({
    queryKey: ['monitoring', 'containers', opts],
    queryFn: () => api.get('/monitoring/containers', { params: opts }).then((r) => unwrap<ContainerSample[]>(r)),
    refetchInterval: refetchMs,
  });
}

export function useContainerMetrics(containerId: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['monitoring', 'container-metrics', containerId, from.toISOString(), to.toISOString()],
    queryFn: () => api.get(`/monitoring/containers/${containerId}/metrics`, {
      params: { from: from.toISOString(), to: to.toISOString() },
    }).then((r) => unwrap<ContainerSample[]>(r)),
    enabled: !!containerId,
    refetchInterval: 60_000,
  });
}

export function useAlarms(filters: { status?: string; severity?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['monitoring', 'alarms', filters],
    queryFn: () => api.get('/monitoring/alarms', { params: filters }).then((r) => unwrap<Alarm[]>(r)),
    refetchInterval: 15_000,
  });
}

export function useAlarm(id: string | undefined) {
  return useQuery({
    queryKey: ['monitoring', 'alarm', id],
    queryFn: () => api.get(`/monitoring/alarms/${id}`).then((r) => unwrap<Alarm>(r)),
    enabled: !!id,
  });
}

export function useFiringCount() {
  return useQuery({
    queryKey: ['monitoring', 'firing-count'],
    queryFn: () => api.get('/monitoring/alarms/firing-count').then((r) => unwrap<{ count: number }>(r)),
    refetchInterval: 15_000,
  });
}

export function useAckAlarm() {
  return useAppMutation(
    (id: string) => api.post(`/monitoring/alarms/${id}/acknowledge`).then((r) => unwrap(r)),
    { successMessage: 'Alarm acknowledged', invalidate: [['monitoring', 'alarms']] },
  );
}

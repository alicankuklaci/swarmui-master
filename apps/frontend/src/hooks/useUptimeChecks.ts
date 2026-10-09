import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAppMutation } from './useAppMutation';

export interface UptimeCheck {
  _id: string;
  name: string;
  type: 'http' | 'tcp' | 'ping';
  target: string;
  intervalSec: number;
  timeoutSec: number;
  expectedStatus?: number;
  expectedBody?: string;
  method?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  lastStatus?: 'up' | 'down' | 'unknown';
  lastResponseMs?: number;
  lastHttpStatus?: number;
  lastCheckedAt?: string;
  lastError?: string;
  successRate24h?: number;
  samples24h?: number;
}

export function useUptimeChecks() {
  return useQuery({
    queryKey: ['uptime-checks'],
    queryFn: () => api.get('/monitoring/uptime-checks').then((r) => unwrap<UptimeCheck[]>(r)),
    refetchInterval: 30_000,
  });
}

export function useUptimeHistory(id: string | undefined, from: Date, to: Date) {
  return useQuery({
    queryKey: ['uptime-history', id, from.toISOString(), to.toISOString()],
    queryFn: () => api.get(`/monitoring/uptime-checks/${id}/history`, {
      params: { from: from.toISOString(), to: to.toISOString() },
    }).then((r) => unwrap<any[]>(r)),
    enabled: !!id,
  });
}

export function useCreateCheck() {
  return useAppMutation(
    (dto: Partial<UptimeCheck>) => api.post('/monitoring/uptime-checks', dto).then((r) => unwrap(r)),
    { successMessage: 'Uptime check created', invalidate: [['uptime-checks']] },
  );
}

export function useUpdateCheck() {
  return useAppMutation(
    ({ id, patch }: { id: string; patch: Partial<UptimeCheck> }) =>
      api.patch(`/monitoring/uptime-checks/${id}`, patch).then((r) => unwrap(r)),
    { successMessage: 'Updated', invalidate: [['uptime-checks']] },
  );
}

export function useDeleteCheck() {
  return useAppMutation(
    (id: string) => api.delete(`/monitoring/uptime-checks/${id}`).then((r) => unwrap(r)),
    { successMessage: 'Deleted', invalidate: [['uptime-checks']] },
  );
}

export function useTestCheck() {
  return useAppMutation(
    (id: string) => api.post(`/monitoring/uptime-checks/${id}/test`).then((r) => unwrap(r)),
    { invalidate: [['uptime-checks']] },
  );
}

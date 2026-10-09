import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAppMutation } from './useAppMutation';

export interface AlarmRule {
  _id: string;
  name: string;
  description?: string;
  target: 'node' | 'container' | 'uptime' | 'stack';
  targetFilter?: { nodeId?: string; containerName?: string; stackName?: string; uptimeCheckId?: string };
  metric: 'cpu' | 'mem' | 'disk' | 'uptime' | 'containerCount';
  operator: '>' | '<' | '==' | '>=' | '<=';
  threshold: number;
  windowSec: number;
  cooldownSec: number;
  severity: 'info' | 'warning' | 'critical';
  channelIds: string[];
  enabled: boolean;
  state?: 'ok' | 'pending' | 'firing';
  lastFiredAt?: string;
}

export function useAlarmRules() {
  return useQuery({
    queryKey: ['alarm-rules'],
    queryFn: () => api.get('/monitoring/alarm-rules').then((r) => unwrap<AlarmRule[]>(r)),
    refetchInterval: 30_000,
  });
}

export function useCreateRule() {
  return useAppMutation(
    (dto: Partial<AlarmRule>) => api.post('/monitoring/alarm-rules', dto).then((r) => unwrap(r)),
    { successMessage: 'Rule created', invalidate: [['alarm-rules']] },
  );
}

export function useUpdateRule() {
  return useAppMutation(
    ({ id, patch }: { id: string; patch: Partial<AlarmRule> }) =>
      api.patch(`/monitoring/alarm-rules/${id}`, patch).then((r) => unwrap(r)),
    { invalidate: [['alarm-rules']] },
  );
}

export function useDeleteRule() {
  return useAppMutation(
    (id: string) => api.delete(`/monitoring/alarm-rules/${id}`).then((r) => unwrap(r)),
    { successMessage: 'Deleted', invalidate: [['alarm-rules']] },
  );
}

export function useTestRule() {
  return useAppMutation(
    (id: string) => api.post(`/monitoring/alarm-rules/${id}/test`).then((r) => unwrap(r)),
    { successMessage: 'Test alarm fired' },
  );
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAppMutation } from './useAppMutation';

export type ChannelType = 'telegram' | 'slack' | 'email' | 'webhook';

export interface ChannelFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'textarea' | 'url' | 'select' | 'multi-text';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  help?: string;
  secret?: boolean;
}

export interface NotificationChannel {
  _id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  lastTestResult?: { ts: string; success: boolean; error?: string };
  createdAt: string;
  updatedAt: string;
  configMasked: Record<string, any>;
}

export function useChannelTypes() {
  return useQuery({
    queryKey: ['notification-channel-types'],
    queryFn: () => api.get('/notifications/channels/types').then((r) =>
      unwrap<Array<{ type: ChannelType; schema: ChannelFieldSchema[] }>>(r)),
    staleTime: 10 * 60 * 1000,
  });
}

export function useNotificationChannels() {
  return useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api.get('/notifications/channels').then((r) => unwrap<NotificationChannel[]>(r)),
  });
}

export function useCreateChannel() {
  return useAppMutation(
    (dto: { name: string; type: ChannelType; config: Record<string, any>; enabled?: boolean }) =>
      api.post('/notifications/channels', dto).then((r) => unwrap(r)),
    { successMessage: 'Channel created', invalidate: [['notification-channels']] },
  );
}

export function useUpdateChannel() {
  return useAppMutation(
    ({ id, patch }: { id: string; patch: { name?: string; config?: Record<string, any>; enabled?: boolean } }) =>
      api.patch(`/notifications/channels/${id}`, patch).then((r) => unwrap(r)),
    { invalidate: [['notification-channels']] },
  );
}

export function useDeleteChannel() {
  return useAppMutation(
    (id: string) => api.delete(`/notifications/channels/${id}`).then((r) => unwrap(r)),
    { successMessage: 'Channel deleted', invalidate: [['notification-channels']] },
  );
}

export function useTestChannel() {
  return useAppMutation(
    (id: string) => api.post(`/notifications/channels/${id}/test`).then((r) => unwrap<{ success: boolean; error?: string; info?: Record<string, any> }>(r)),
    { invalidate: [['notification-channels']] },
  );
}

export interface ChannelTestDebugResult {
  success: boolean;
  error?: string;
  info?: Record<string, any>;
  transcript?: string[];
}

/** Debug test — hits /test-debug and returns the full transcript. Does NOT raise a toast; the dialog renders the result inline. */
export function useTestChannelDebug() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/notifications/channels/${id}/test-debug`).then((r) => unwrap<ChannelTestDebugResult>(r)),
  });
}

export interface NotificationLogEntry {
  _id: string;
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  ts: string;
  success: boolean;
  error?: string;
  latencyMs: number;
  test?: boolean;
  info?: Record<string, any>;
  transcript?: string[];
}

export function useChannelLogs(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['notification-channel-logs', id],
    queryFn: () => api.get(`/notifications/channels/${id}/logs`, { params: { limit: 50 } })
      .then((r) => unwrap<NotificationLogEntry[]>(r)),
    enabled: !!id && enabled,
    refetchOnWindowFocus: false,
  });
}

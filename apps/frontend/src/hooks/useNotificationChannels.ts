import { useQuery } from '@tanstack/react-query';
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
    (id: string) => api.post(`/notifications/channels/${id}/test`).then((r) => unwrap<{ success: boolean; error?: string }>(r)),
    { invalidate: [['notification-channels']] },
  );
}

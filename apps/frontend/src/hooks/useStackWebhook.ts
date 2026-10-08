import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/useToast';

function errorToast(verb: string) {
  return (err: any) => {
    const description = err?.response?.data?.message || err?.message || `Failed to ${verb}`;
    toast({ variant: 'destructive', title: 'Error', description });
  };
}

export interface StackWebhookData {
  token: string;
  createdBy: string;
  createdAt: string;
}

export function useStackWebhook(endpointId: string, stackName: string) {
  const qc = useQueryClient();
  const key = ['stack-webhook', endpointId, stackName];

  const query = useQuery<StackWebhookData | null>({
    queryKey: key,
    queryFn: () =>
      api
        .get(`/endpoints/${endpointId}/swarm/stacks/${stackName}/webhook`)
        .then((r: { data: unknown }) => {
          const d = r.data as any;
          const payload = d?.data ?? d;
          if (!payload || !payload.token) return null;
          return payload as StackWebhookData;
        })
        .catch((e: { response?: { status: number } }) =>
          e.response?.status === 404 ? null : Promise.reject(e)
        ),
    enabled: !!endpointId && !!stackName,
  });

  const generate = useMutation({
    mutationFn: () =>
      api
        .post(`/endpoints/${endpointId}/swarm/stacks/${stackName}/webhook`)
        .then((r: { data: unknown }) => { const d = r.data as any; return (d?.data ?? d) as StackWebhookData; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: 'Webhook created' });
    },
    onError: errorToast('create webhook'),
  });

  const revoke = useMutation({
    mutationFn: () =>
      api
        .delete(`/endpoints/${endpointId}/swarm/stacks/${stackName}/webhook`)
        .then((r: { data: unknown }) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: 'Webhook revoked' });
    },
    onError: errorToast('revoke webhook'),
  });

  return { query, generate, revoke };
}

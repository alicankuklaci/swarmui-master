import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
          return (d?.data ?? d) as StackWebhookData;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const revoke = useMutation({
    mutationFn: () =>
      api
        .delete(`/endpoints/${endpointId}/swarm/stacks/${stackName}/webhook`)
        .then((r: { data: unknown }) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { query, generate, revoke };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Containers ────────────────────────────────────────────────────────────

export function useContainers(endpointId: string, all = true) {
  return useQuery({
    queryKey: ['containers', endpointId, all],
    queryFn: () => api.get(`/endpoints/${endpointId}/containers?all=${all}`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
    refetchInterval: 5000,
  });
}

export function useContainer(endpointId: string, id: string) {
  return useQuery({
    queryKey: ['container', endpointId, id],
    queryFn: () => api.get(`/endpoints/${endpointId}/containers/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && !!id,
  });
}

export function useContainerAction(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: any }) =>
      api.post(`/endpoints/${endpointId}/containers/${id}/${action}`, body).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers', endpointId] }),
  });
}

export function useCreateContainer(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post(`/endpoints/${endpointId}/containers`, dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers', endpointId] }),
  });
}

export function useRemoveContainer(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api.delete(`/endpoints/${endpointId}/containers/${id}?force=${force || false}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers', endpointId] }),
  });
}

// ─── Images ────────────────────────────────────────────────────────────────

export function useImages(endpointId: string) {
  return useQuery({
    queryKey: ['images', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/images`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
  });
}

export function useRemoveImage(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api.delete(`/endpoints/${endpointId}/images/${id}?force=${force || false}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images', endpointId] }),
  });
}

export function usePruneImages(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/endpoints/${endpointId}/images`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images', endpointId] }),
  });
}

export function useSearchImages(endpointId: string, term: string) {
  return useQuery({
    queryKey: ['image-search', endpointId, term],
    queryFn: () => api.get(`/endpoints/${endpointId}/images/search?term=${term}`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && term.length > 2,
  });
}

// ─── Networks ──────────────────────────────────────────────────────────────

export function useNetworks(endpointId: string) {
  return useQuery({
    queryKey: ['networks', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/networks`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
  });
}

export function useCreateNetwork(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; driver?: string; options?: any }) =>
      api.post(`/endpoints/${endpointId}/networks`, body).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', endpointId] }),
  });
}

export function useRemoveNetwork(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/endpoints/${endpointId}/networks/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', endpointId] }),
  });
}

// ─── Volumes ───────────────────────────────────────────────────────────────

export function useVolumes(endpointId: string) {
  return useQuery({
    queryKey: ['volumes', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/volumes`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
  });
}

export function useCreateVolume(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; driver?: string }) =>
      api.post(`/endpoints/${endpointId}/volumes`, body).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['volumes', endpointId] }),
  });
}

export function useRemoveVolume(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.delete(`/endpoints/${endpointId}/volumes/${name}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['volumes', endpointId] }),
  });
}

// ─── Swarm ─────────────────────────────────────────────────────────────────

export function useSwarmInfo(endpointId: string) {
  return useQuery({
    queryKey: ['swarm-info', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/info`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
  });
}

export function useNodes(endpointId: string) {
  return useQuery({
    queryKey: ['nodes', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/nodes`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
    refetchInterval: 10000,
  });
}

export function useUpdateNode(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      api.patch(`/endpoints/${endpointId}/swarm/nodes/${id}`, body).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes', endpointId] }),
  });
}

export function useRemoveNode(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      api.delete(`/endpoints/${endpointId}/swarm/nodes/${id}?force=${force || false}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nodes', endpointId] }),
  });
}

export function useServices(endpointId: string) {
  return useQuery({
    queryKey: ['services', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/services`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
    refetchInterval: 5000,
  });
}

export function useService(endpointId: string, id: string) {
  return useQuery({
    queryKey: ['service', endpointId, id],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/services/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && !!id,
  });
}

export function useServiceTasks(endpointId: string, id: string) {
  return useQuery({
    queryKey: ['service-tasks', endpointId, id],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/services/${id}/tasks`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && !!id,
    refetchInterval: 5000,
  });
}

export function useScaleService(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replicas }: { id: string; replicas: number }) =>
      api.post(`/endpoints/${endpointId}/swarm/services/${id}/scale`, { replicas }).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services', endpointId] }),
  });
}

export function useRemoveService(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/endpoints/${endpointId}/swarm/services/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services', endpointId] }),
  });
}

export function useStacks(endpointId: string) {
  return useQuery({
    queryKey: ['stacks', endpointId],
    queryFn: () => api.get(`/endpoints/${endpointId}/swarm/stacks`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId,
    refetchInterval: 10000,
  });
}

export function useDeployStack(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; composeContent: string }) =>
      api.post(`/endpoints/${endpointId}/swarm/stacks`, body).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks', endpointId] }),
  });
}

export function useRemoveStack(endpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.delete(`/endpoints/${endpointId}/swarm/stacks/${name}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stacks', endpointId] }),
  });
}

// ─── Auto-select endpoint ────────────────────────────────────────────────────
import { useEffect } from 'react';
import { useAppStore } from '@/stores/app.store';

export function useAutoSelectEndpoint() {
  const { selectedEndpointId, setSelectedEndpoint } = useAppStore();
  const { data } = useQuery({
    queryKey: ['endpoints-auto'],
    queryFn: () => api.get('/endpoints', { params: { limit: 10 } }).then((r) => r.data?.data?.data ?? []),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!selectedEndpointId && data && data.length > 0) {
      setSelectedEndpoint(data[0]._id);
    }
  }, [data, selectedEndpointId, setSelectedEndpoint]);
}

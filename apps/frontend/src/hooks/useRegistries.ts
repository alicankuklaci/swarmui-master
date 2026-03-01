import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRegistries() {
  return useQuery({
    queryKey: ['registries'],
    queryFn: () => api.get('/registries').then((r) => r.data),
  });
}

export function useRegistry(id: string) {
  return useQuery({
    queryKey: ['registry', id],
    queryFn: () => api.get(`/registries/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateRegistry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/registries', dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });
}

export function useUpdateRegistry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.patch(`/registries/${id}`, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });
}

export function useRemoveRegistry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/registries/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
  });
}

export function useTestRegistryAuth() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/registries/${id}/test`).then((r) => r.data),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/useToast';

function errorToast(verb: string) {
  return (err: any) => {
    const description = err?.response?.data?.message || err?.message || `Failed to ${verb}`;
    toast({ variant: 'destructive', title: 'Error', description });
  };
}

export function useRegistries() {
  return useQuery({
    queryKey: ['registries'],
    queryFn: () => api.get('/registries').then((r) => r.data?.data ?? r.data),
  });
}

export function useRegistry(id: string) {
  return useQuery({
    queryKey: ['registry', id],
    queryFn: () => api.get(`/registries/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
  });
}

export function useCreateRegistry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/registries', dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
    onError: errorToast('create registry'),
  });
}

export function useUpdateRegistry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.patch(`/registries/${id}`, dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['registries'] }),
    onError: errorToast('update registry'),
  });
}

export function useRemoveRegistry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/registries/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registries'] });
      toast({ title: 'Registry removed' });
    },
    onError: errorToast('remove registry'),
  });
}

export function useTestRegistryAuth() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/registries/${id}/test`).then((r) => r.data?.data ?? r.data),
  });
}

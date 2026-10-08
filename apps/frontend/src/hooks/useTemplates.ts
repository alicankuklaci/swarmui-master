import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/useToast';

function errorToast(verb: string) {
  return (err: any) => {
    const description = err?.response?.data?.message || err?.message || `Failed to ${verb}`;
    toast({ variant: 'destructive', title: 'Error', description });
  };
}

export function useTemplates(category?: string, search?: string) {
  return useQuery({
    queryKey: ['templates', category, search],
    throwOnError: false,
    queryFn: () => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (search) params.set('search', search);
      return api.get(`/templates?${params.toString()}`).then((r) => r.data?.data ?? r.data);
    },
  });
}

export function useTemplateCategories() {
  return useQuery({
    queryKey: ['template-categories'],
    throwOnError: false,
    queryFn: () => api.get('/templates/categories').then((r) => r.data?.data ?? r.data),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: ['template', id],
    throwOnError: false,
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/templates', dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Template created' });
    },
    onError: errorToast('create template'),
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.patch(`/templates/${id}`, dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Template updated' });
    },
    onError: errorToast('update template'),
  });
}

export function useRemoveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: 'Template removed' });
    },
    onError: errorToast('remove template'),
  });
}

export function useDeployTemplate() {
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) =>
      api.post(`/templates/${id}/deploy`, dto).then((r) => r.data?.data ?? r.data),
    onSuccess: (data: any) => {
      // Per-service failure check matching the stack deploy pattern.
      const failed = Array.isArray(data?.services)
        ? data.services.filter((s: any) => s?.action === 'failed')
        : [];
      if (failed.length > 0) {
        const summary = failed
          .map((s: any) => `• ${s.name ?? '?'}: ${s.error ?? 'unknown error'}`)
          .join('\n');
        toast({
          variant: 'destructive',
          title: `${failed.length} service(s) failed`,
          description: summary,
        });
      } else {
        toast({ title: 'Template deployed' });
      }
    },
    onError: errorToast('deploy template'),
  });
}

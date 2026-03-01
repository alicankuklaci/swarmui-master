import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/templates', dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.patch(`/templates/${id}`, dto).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useRemoveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeployTemplate() {
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) =>
      api.post(`/templates/${id}/deploy`, dto).then((r) => r.data),
  });
}

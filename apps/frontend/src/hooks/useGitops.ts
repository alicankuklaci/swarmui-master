import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Deployments ──────────────────────────────────────────────────────────────

export function useGitopsDeployments() {
  return useQuery({
    queryKey: ['gitops-deployments'],
    throwOnError: false,
    queryFn: () => api.get('/gitops').then((r) => r.data?.data ?? r.data),
    refetchInterval: 15000,
  });
}

export function useGitopsDeployment(id: string) {
  return useQuery({
    queryKey: ['gitops-deployment', id],
    throwOnError: false,
    queryFn: () => api.get(`/gitops/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useCreateGitopsDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/gitops', dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gitops-deployments'] }),
  });
}

export function useUpdateGitopsDeployment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.patch(`/gitops/${id}`, dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gitops-deployments'] });
      qc.invalidateQueries({ queryKey: ['gitops-deployment', id] });
    },
  });
}

export function useRemoveGitopsDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/gitops/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gitops-deployments'] }),
  });
}

export function useTriggerGitopsDeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/gitops/${id}/deploy`).then((r) => r.data?.data ?? r.data),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['gitops-deployment', id] });
      qc.invalidateQueries({ queryKey: ['gitops-deployments'] });
    },
  });
}

export function useGitopsDeployHistory(id: string) {
  return useQuery({
    queryKey: ['gitops-history', id],
    throwOnError: false,
    queryFn: () => api.get(`/gitops/${id}/history`).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
  });
}

// ─── Git Credentials ─────────────────────────────────────────────────────────

export function useGitCredentials() {
  return useQuery({
    queryKey: ['git-credentials'],
    throwOnError: false,
    queryFn: () => api.get('/gitops/credentials/list').then((r) => r.data?.data ?? r.data),
  });
}

export function useCreateGitCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: any) => api.post('/gitops/credentials', dto).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['git-credentials'] }),
  });
}

export function useRemoveGitCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/gitops/credentials/${id}`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['git-credentials'] }),
  });
}

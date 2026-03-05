import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, RotateCw, Trash2, Search, Loader2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/docker/StatusBadge';
import { api } from '@/lib/api';
import { useContainers, useContainerAction, useRemoveContainer } from '@/hooks/useDocker';



function formatPorts(ports: any[]): string {
  if (!ports || ports.length === 0) return '-';
  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}:${p.PrivatePort}`)
    .join(', ') || '-';
}

function formatDate(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString();
}

function cleanName(names: string[]): string {
  if (!names || names.length === 0) return 'unknown';
  return names[0].replace(/^\//, '');
}

export function ContainersPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const [showAll, setShowAll] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: containers, isLoading } = useContainers(endpointId, showAll);
  const actionMutation = useContainerAction(endpointId);
  const removeMutation = useRemoveContainer(endpointId);
  const queryClient = useQueryClient();
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/endpoints/${endpointId}/containers/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['containers', endpointId] }),
  });

  const filtered = (containers || []).filter((c: any) => {
    const name = cleanName(c.Names || []);
    const image = c.Image || '';
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || image.toLowerCase().includes(q);
  });

  async function handleAction(id: string, action: string) {
    try {
      setError(null);
      await actionMutation.mutateAsync({ id, action });
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to ${action} container`);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this container?')) return;
    try {
      setError(null);
      await removeMutation.mutateAsync({ id, force: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove container');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Containers</h1>
          <p className="text-muted-foreground">Manage Docker containers</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded"
            />
            Show All
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search containers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Image</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Ports</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading containers...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No containers found
                  </td>
                </tr>
              ) : (
                filtered.map((container: any) => {
                  const name = cleanName(container.Names || []);
                  const status: string = (container.State || '').toLowerCase();
                  const isRunning = status === 'running';
                  const isStopped = status === 'exited' || status === 'stopped' || status === 'created';

                  return (
                    <tr key={container.Id} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        <Link
                          to={`/containers/${container.Id}`}
                          className="font-medium text-primary hover:underline font-mono text-xs"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs max-w-[200px] truncate">
                        {container.Image}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {formatPorts(container.Ports || [])}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatDate(container.Created)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {isStopped && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Start"
                              onClick={() => handleAction(container.Id, 'start')}
                              disabled={actionMutation.isPending}
                            >
                              <Play className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          {isRunning && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Stop"
                              onClick={() => handleAction(container.Id, 'stop')}
                              disabled={actionMutation.isPending}
                            >
                              <Square className="w-4 h-4 text-yellow-600" />
                            </Button>
                          )}
                          {isRunning && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Restart"
                              onClick={() => handleAction(container.Id, 'restart')}
                              disabled={actionMutation.isPending}
                            >
                              <RotateCw className="w-4 h-4 text-blue-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Duplicate"
                            onClick={() => { if (confirm(`Duplicate container "${name}"?`)) duplicateMutation.mutate(container.Id); }}
                            disabled={duplicateMutation.isPending}
                          >
                            <Copy className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove"
                            onClick={() => handleRemove(container.Id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, FolderOpen, File, Folder, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useVolumes, useCreateVolume, useRemoveVolume } from '@/hooks/useDocker';



export function VolumesPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const [createOpen, setCreateOpen] = useState(false);
  const [volumeName, setVolumeName] = useState('');
  const [volumeDriver, setVolumeDriver] = useState('local');
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [browseVolume, setBrowseVolume] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState('/');

  const { data: volumesData, isLoading } = useVolumes(endpointId);
  const { data: browseFiles, isLoading: browseLoading } = useQuery({
    queryKey: ['volume-browse', endpointId, browseVolume, browsePath],
    queryFn: () => api.get(`/endpoints/${endpointId}/volumes/${browseVolume}/browse`, { params: { path: browsePath } }).then((r) => r.data?.data ?? r.data ?? []),
    enabled: !!endpointId && !!browseVolume,
  });
  const createMutation = useCreateVolume(endpointId);
  const removeMutation = useRemoveVolume(endpointId);

  // Docker API returns { Volumes: [...], Warnings: [...] }
  const volumes: any[] = volumesData?.Volumes ?? volumesData ?? [];

  function openCreate() {
    setVolumeName('');
    setVolumeDriver('local');
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!volumeName.trim()) return;
    try {
      setCreateError(null);
      await createMutation.mutateAsync({
        name: volumeName.trim(),
        driver: volumeDriver.trim() || 'local',
      });
      setCreateOpen(false);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to create volume');
    }
  }

  async function handleRemove(name: string) {
    if (!confirm(`Remove volume "${name}"?`)) return;
    try {
      setError(null);
      await removeMutation.mutateAsync(name);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove volume');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Volumes</h1>
          <p className="text-muted-foreground">Manage Docker volumes</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Volume
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Driver</th>
                <th className="text-left p-3 font-medium">Mountpoint</th>
                <th className="text-left p-3 font-medium">Scope</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading volumes...
                  </td>
                </tr>
              ) : volumes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No volumes found
                  </td>
                </tr>
              ) : (
                volumes.map((volume: any) => (
                  <tr key={volume.Name} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium font-mono text-xs max-w-[220px] truncate">
                      {volume.Name}
                    </td>
                    <td className="p-3 text-muted-foreground">{volume.Driver || '-'}</td>
                    <td className="p-3 text-muted-foreground font-mono text-xs max-w-[300px] truncate">
                      {volume.Mountpoint || '-'}
                    </td>
                    <td className="p-3 text-muted-foreground">{volume.Scope || '-'}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Browse"
                          onClick={() => { setBrowseVolume(volume.Name); setBrowsePath('/'); }}
                        >
                          <FolderOpen className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove"
                          onClick={() => handleRemove(volume.Name)}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Browse Volume Dialog */}
      <Dialog open={!!browseVolume} onOpenChange={(open) => { if (!open) setBrowseVolume(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Browse: {browseVolume}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="outline" size="sm"
              disabled={browsePath === '/'}
              onClick={() => {
                const parts = browsePath.split('/').filter(Boolean);
                parts.pop();
                setBrowsePath('/' + parts.join('/'));
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Up
            </Button>
            <span className="text-sm font-mono text-muted-foreground">{browsePath}</span>
          </div>
          <div className="max-h-80 overflow-y-auto border rounded">
            {browseLoading ? (
              <p className="p-4 text-center text-muted-foreground">Loading...</p>
            ) : !browseFiles || browseFiles.length === 0 ? (
              <p className="p-4 text-center text-muted-foreground">Empty directory</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {browseFiles.map((f: any) => (
                    <tr
                      key={f.name}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        if (f.type === 'dir') {
                          setBrowsePath(browsePath === '/' ? `/${f.name}` : `${browsePath}/${f.name}`);
                        }
                      }}
                    >
                      <td className="p-2">
                        {f.type === 'dir' ? <Folder className="w-4 h-4 text-blue-500 inline mr-2" /> : <File className="w-4 h-4 text-gray-400 inline mr-2" />}
                        <span className="font-mono text-xs">{f.name}</span>
                      </td>
                      <td className="p-2 text-right text-muted-foreground text-xs">
                        {f.type === 'file' ? `${f.size} B` : ''}
                      </td>
                      <td className="p-2 text-right text-muted-foreground text-xs">{f.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Volume Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Volume</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="my-volume"
                value={volumeName}
                onChange={(e) => setVolumeName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Input
                placeholder="local"
                value={volumeDriver}
                onChange={(e) => setVolumeDriver(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !volumeName.trim()}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

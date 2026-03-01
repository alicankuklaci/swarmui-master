import { useState } from 'react';
import { Trash2, Download, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useImages, useRemoveImage, usePruneImages } from '@/hooks/useDocker';
import { api } from '@/lib/api';

const ENDPOINT_ID = 'local';

function formatSize(bytes: number): string {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString();
}

function parseRepoTag(repoTag: string): { repo: string; tag: string } {
  if (!repoTag || repoTag === '<none>:<none>') {
    return { repo: '<none>', tag: '<none>' };
  }
  const lastColon = repoTag.lastIndexOf(':');
  if (lastColon === -1) return { repo: repoTag, tag: 'latest' };
  return { repo: repoTag.slice(0, lastColon), tag: repoTag.slice(lastColon + 1) };
}

export function ImagesPage() {
  const [pullOpen, setPullOpen] = useState(false);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [imageName, setImageName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: images, isLoading } = useImages(ENDPOINT_ID);
  const removeMutation = useRemoveImage(ENDPOINT_ID);
  const pruneMutation = usePruneImages(ENDPOINT_ID);

  async function handlePull() {
    if (!imageName.trim()) return;
    try {
      setPulling(true);
      setPullError(null);
      await api.get(`/endpoints/local/images/pull?image=${encodeURIComponent(imageName.trim())}`);
      setPullOpen(false);
      setImageName('');
    } catch (err: any) {
      setPullError(err?.response?.data?.message || 'Failed to pull image');
    } finally {
      setPulling(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      setError(null);
      await removeMutation.mutateAsync({ id, force: false });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove image');
    }
  }

  async function handlePrune() {
    try {
      setError(null);
      await pruneMutation.mutateAsync();
      setPruneOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to prune images');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Images</h1>
          <p className="text-muted-foreground">Manage Docker images</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPruneOpen(true)}>
            <AlertTriangle className="w-4 h-4 mr-2" />
            Prune All
          </Button>
          <Button onClick={() => { setPullOpen(true); setPullError(null); setImageName(''); }}>
            <Download className="w-4 h-4 mr-2" />
            Pull Image
          </Button>
        </div>
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
                <th className="text-left p-3 font-medium">Repository</th>
                <th className="text-left p-3 font-medium">Tag</th>
                <th className="text-left p-3 font-medium">Image ID</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading images...
                  </td>
                </tr>
              ) : !images || images.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No images found
                  </td>
                </tr>
              ) : (
                images.flatMap((image: any) => {
                  const tags: string[] =
                    image.RepoTags && image.RepoTags.length > 0
                      ? image.RepoTags
                      : ['<none>:<none>'];
                  return tags.map((tag: string, idx: number) => {
                    const { repo, tag: tagName } = parseRepoTag(tag);
                    const shortId = (image.Id || '').replace('sha256:', '').slice(0, 12);
                    return (
                      <tr key={`${image.Id}-${idx}`} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{repo}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{tagName}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{shortId}</td>
                        <td className="p-3 text-muted-foreground">{formatSize(image.Size)}</td>
                        <td className="p-3 text-muted-foreground text-xs">{formatDate(image.Created)}</td>
                        <td className="p-3">
                          {idx === 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Remove"
                              onClick={() => handleRemove(image.Id)}
                              disabled={removeMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pull Image Dialog */}
      <Dialog open={pullOpen} onOpenChange={setPullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pull Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Image Name</label>
              <Input
                placeholder="e.g. nginx:latest"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePull()}
                disabled={pulling}
              />
            </div>
            {pullError && (
              <p className="text-sm text-destructive">{pullError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPullOpen(false)} disabled={pulling}>
              Cancel
            </Button>
            <Button onClick={handlePull} disabled={pulling || !imageName.trim()}>
              {pulling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Pull
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prune Confirmation Dialog */}
      <Dialog open={pruneOpen} onOpenChange={setPruneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prune Unused Images</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove all dangling and unused images. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPruneOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handlePrune} disabled={pruneMutation.isPending}>
              {pruneMutation.isPending ? 'Pruning...' : 'Prune All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

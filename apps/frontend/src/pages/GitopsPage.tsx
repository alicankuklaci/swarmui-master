import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useGitopsDeployments,
  useCreateGitopsDeployment,
  useRemoveGitopsDeployment,
  useTriggerGitopsDeploy,
} from '@/hooks/useGitops';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlusIcon, PlayIcon, Trash2Icon, ExternalLinkIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'outline',
  success: 'default',
  failed: 'destructive',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={(STATUS_COLORS[status] ?? 'secondary') as any}>
      {status}
    </Badge>
  );
}

const EMPTY_FORM = {
  name: '',
  deployType: 'stack',
  repoUrl: '',
  branch: 'main',
  composePath: 'docker-compose.yml',
  pollingIntervalMinutes: 5,
  autoUpdate: true,
};

export function GitopsPage() {
  const { data: deployments, isLoading } = useGitopsDeployments();
  const createDeployment = useCreateGitopsDeployment();
  const removeDeployment = useRemoveGitopsDeployment();
  const triggerDeploy = useTriggerGitopsDeploy();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    try {
      await createDeployment.mutateAsync(form);
      toast({ title: 'GitOps deployment created' });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTrigger(id: string) {
    setTriggeringId(id);
    try {
      await triggerDeploy.mutateAsync(id);
      toast({ title: 'Deploy triggered' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setTriggeringId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await removeDeployment.mutateAsync(deleteTarget._id);
      toast({ title: 'Deployment removed' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setDeleteTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading GitOps deployments...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">GitOps</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/gitops/credentials">Git Credentials</Link>
          </Button>
          <Button onClick={() => setOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            New Deployment
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Repo</th>
              <th className="text-left px-4 py-3 font-medium">Branch</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Last Commit</th>
              <th className="text-left px-4 py-3 font-medium">Last Deploy</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(deployments ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No GitOps deployments configured.
                </td>
              </tr>
            )}
            {(deployments ?? []).map((dep: any) => (
              <tr key={dep._id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/gitops/${dep._id}`} className="text-primary hover:underline">
                    {dep.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={dep.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate max-w-[200px]">{dep.repoUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{dep.branch}</Badge>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={dep.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {dep.lastCommitSha ? (
                    <span title={dep.lastCommitMessage}>{dep.lastCommitSha}</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {dep.lastDeployedAt ? new Date(dep.lastDeployedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTrigger(dep._id)}
                      disabled={triggeringId === dep._id}
                    >
                      <PlayIcon className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(dep)}>
                      <Trash2Icon className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New GitOps Deployment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="my-app"
              />
            </div>
            <div>
              <Label>Deploy Type</Label>
              <Select
                value={form.deployType}
                onValueChange={(v) => setForm({ ...form, deployType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stack">Stack</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Repository URL</Label>
              <Input
                value={form.repoUrl}
                onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/user/repo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Branch</Label>
                <Input
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  placeholder="main"
                />
              </div>
              <div>
                <Label>Compose Path</Label>
                <Input
                  value={form.composePath}
                  onChange={(e) => setForm({ ...form, composePath: e.target.value })}
                  placeholder="docker-compose.yml"
                />
              </div>
            </div>
            <div>
              <Label>Polling Interval (minutes)</Label>
              <Input
                type="number"
                value={form.pollingIntervalMinutes}
                onChange={(e) =>
                  setForm({ ...form, pollingIntervalMinutes: parseInt(e.target.value) || 5 })
                }
                min={1}
                max={1440}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-update"
                checked={form.autoUpdate}
                onChange={(e) => setForm({ ...form, autoUpdate: e.target.checked })}
              />
              <Label htmlFor="auto-update">Auto-update on changes</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Deployment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove deployment <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

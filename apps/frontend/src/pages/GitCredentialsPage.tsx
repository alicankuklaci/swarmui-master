import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGitCredentials, useCreateGitCredentials, useRemoveGitCredentials } from '@/hooks/useGitops';
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
import { PlusIcon, Trash2Icon, ArrowLeftIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const EMPTY_FORM = { name: '', type: 'pat', username: '', token: '', sshKey: '', description: '' };

export function GitCredentialsPage() {
  const { data: credentials, isLoading } = useGitCredentials();
  const createCredentials = useCreateGitCredentials();
  const removeCredentials = useRemoveGitCredentials();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  async function handleCreate() {
    setSaving(true);
    try {
      await createCredentials.mutateAsync(form);
      toast({ title: 'Credentials created' });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await removeCredentials.mutateAsync(deleteTarget._id);
      toast({ title: 'Credentials deleted' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setDeleteTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/gitops">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold flex-1">Git Credentials</h1>
        <Button onClick={() => setOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Credentials
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Username</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(credentials ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">
                  No git credentials configured.
                </td>
              </tr>
            )}
            {(credentials ?? []).map((cred: any) => (
              <tr key={cred._id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{cred.name}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{cred.type === 'pat' ? 'PAT' : 'SSH Key'}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{cred.username || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{cred.description || '—'}</td>
                <td className="px-4 py-3">
                  <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(cred)}>
                    <Trash2Icon className="h-3 w-3" />
                  </Button>
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
            <DialogTitle>Add Git Credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My GitHub Token"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pat">Personal Access Token (PAT)</SelectItem>
                  <SelectItem value="ssh">SSH Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="github-username"
              />
            </div>
            {form.type === 'pat' && (
              <div>
                <Label>Token</Label>
                <Input
                  type="password"
                  value={form.token}
                  onChange={(e) => setForm({ ...form, token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxx"
                />
              </div>
            )}
            {form.type === 'ssh' && (
              <div>
                <Label>SSH Private Key</Label>
                <textarea
                  className="w-full h-32 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.sshKey}
                  onChange={(e) => setForm({ ...form, sshKey: e.target.value })}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                />
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Credentials</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete credentials <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

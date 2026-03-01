import { useState } from 'react';
import {
  useRegistries,
  useCreateRegistry,
  useUpdateRegistry,
  useRemoveRegistry,
  useTestRegistryAuth,
} from '@/hooks/useRegistries';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PlusIcon, Trash2Icon, PencilIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const REGISTRY_TYPES = ['dockerhub', 'gcr', 'ecr', 'acr', 'gitlab', 'quay', 'custom'];

const DEFAULT_URLS: Record<string, string> = {
  dockerhub: 'https://registry-1.docker.io',
  gcr: 'https://gcr.io',
  ecr: 'https://public.ecr.aws',
  acr: 'https://myregistry.azurecr.io',
  gitlab: 'https://registry.gitlab.com',
  quay: 'https://quay.io',
  custom: 'https://',
};

interface RegistryFormData {
  name: string;
  type: string;
  url: string;
  username: string;
  password: string;
  authentication: boolean;
}

const EMPTY_FORM: RegistryFormData = {
  name: '',
  type: 'custom',
  url: 'https://',
  username: '',
  password: '',
  authentication: false,
};

export function RegistriesPage() {
  const { data: registries, isLoading } = useRegistries();
  const createRegistry = useCreateRegistry();
  const removeRegistry = useRemoveRegistry();
  const testAuth = useTestRegistryAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RegistryFormData>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const updateFormMutation = useUpdateRegistry(editId ?? '');

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(reg: any) {
    setEditId(reg._id);
    setForm({
      name: reg.name,
      type: reg.type,
      url: reg.url,
      username: reg.username ?? '',
      password: '',
      authentication: reg.authentication ?? false,
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editId) {
        await updateFormMutation.mutateAsync(form);
        toast({ title: 'Registry updated' });
      } else {
        await createRegistry.mutateAsync(form);
        toast({ title: 'Registry created' });
      }
      setOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await removeRegistry.mutateAsync(deleteTarget._id);
      toast({ title: 'Registry deleted' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const result = await testAuth.mutateAsync(id);
      if (result.success) {
        toast({ title: 'Auth OK', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Auth Failed', description: result.message });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Test failed', description: err?.message });
    } finally {
      setTestingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading registries...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Registries</h1>
        <Button onClick={openCreate}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Registry
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">URL</th>
              <th className="text-left px-4 py-3 font-medium">Auth</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(registries ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">
                  No registries configured.
                </td>
              </tr>
            )}
            {(registries ?? []).map((reg: any) => (
              <tr key={reg._id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{reg.name}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{reg.type}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{reg.url}</td>
                <td className="px-4 py-3">
                  {reg.authentication ? (
                    <CheckCircle2Icon className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTest(reg._id)}
                      disabled={testingId === reg._id}
                    >
                      {testingId === reg._id ? 'Testing...' : 'Test'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(reg)}>
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(reg)}>
                      <Trash2Icon className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Registry' : 'Add Registry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Registry"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v, url: DEFAULT_URLS[v] ?? 'https://' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://registry.example.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auth-toggle"
                checked={form.authentication}
                onChange={(e) => setForm({ ...form, authentication: e.target.checked })}
              />
              <Label htmlFor="auth-toggle">Requires authentication</Label>
            </div>
            {form.authentication && (
              <>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div>
                  <Label>Password / Token</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editId ? '(leave blank to keep existing)' : 'password'}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Registry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete registry <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
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

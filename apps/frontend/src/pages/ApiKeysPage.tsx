import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Copy, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';

type ApiKeyScope = 'read' | 'write' | 'admin';

interface ApiKeyItem {
  _id: string;
  name: string;
  keyPrefix: string;
  scope: ApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  active: boolean;
  createdAt: string;
}

const scopeColors: Record<ApiKeyScope, string> = {
  read: 'default',
  write: 'warning',
  admin: 'destructive',
};

export function ApiKeysPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');

  const { data: keys = [], isLoading } = useQuery<ApiKeyItem[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys').then((r) => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scope: ApiKeyScope[]; expiresAt?: string | null }) =>
      api.post('/api-keys', data).then((r) => r.data),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key created' });
    },
    onError: () => toast({ title: 'Failed to create API key', variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key revoked' });
    },
    onError: () => toast({ title: 'Failed to revoke API key', variant: 'destructive' }),
  });

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleCreate = () => {
    if (!name.trim() || scopes.length === 0) return;
    createMutation.mutate({
      name: name.trim(),
      scope: scopes,
      expiresAt: expiresAt || null,
    });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const resetForm = () => {
    setName('');
    setScopes(['read']);
    setExpiresAt('');
    setCreatedKey(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6" /> API Keys
          </h1>
          <p className="text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Create New API Key</Button>
          </DialogTrigger>
          <DialogContent>
            {createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>API Key Created</DialogTitle>
                  <DialogDescription>Copy your key now. It will not be shown again.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        This key will only be shown once. Copy it now.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <code className="flex-1 bg-white dark:bg-gray-800 border rounded px-3 py-2 text-sm font-mono break-all">
                        {createdKey}
                      </code>
                      <Button variant="outline" size="icon" onClick={() => handleCopy(createdKey)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setCreateOpen(false); resetForm(); }}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>Generate a new key for API access</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input
                      placeholder="e.g. CI/CD Pipeline"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Scope</Label>
                    <div className="flex gap-3 mt-2">
                      {(['read', 'write', 'admin'] as ApiKeyScope[]).map((scope) => (
                        <label key={scope} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                            className="rounded"
                          />
                          <span className="text-sm capitalize">{scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Expiry Date (optional)</Label>
                    <Input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim() || scopes.length === 0}>
                    {createMutation.isPending ? 'Creating...' : 'Create Key'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>{keys.length} key{keys.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No API keys yet. Create one to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k._id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">sk-{k.keyPrefix}...</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {k.scope.map((s) => (
                          <Badge key={s} variant={scopeColors[s] as any} className="text-xs capitalize">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(k.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.expiresAt ? formatDate(k.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.active ? 'success' : 'secondary'}>
                        {k.active ? 'Active' : 'Revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {k.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeMutation.mutate(k._id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

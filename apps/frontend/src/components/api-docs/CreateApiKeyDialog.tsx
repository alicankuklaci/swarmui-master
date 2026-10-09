import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';

export type ApiKeyScope = 'read' | 'write' | 'admin';

/**
 * Dialog for creating a new API key. Extracted so `ApiKeysList` stays under
 * 300 LOC. On success it reveals the plaintext key once with a copy button.
 */
export function CreateApiKeyDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scope: ApiKeyScope[]; expiresAt?: string | null }) =>
      api.post('/api-keys', data).then((r) =>
        Array.isArray(r.data)
          ? r.data
          : Array.isArray(r.data?.data)
            ? r.data.data
            : (r.data?.data ?? r.data),
      ),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key created' });
    },
    onError: () => toast({ title: 'Failed to create API key', variant: 'destructive' }),
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

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Create New API Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Copy your key now. It will not be shown again.
              </DialogDescription>
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
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
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
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !name.trim() || scopes.length === 0}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Key'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

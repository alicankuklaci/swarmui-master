import { useAppStore } from '@/stores/app.store';
import { api } from '@/lib/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStacks, useDeployStack, useRemoveStack } from '@/hooks/useDocker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PlusIcon } from 'lucide-react';



const PLACEHOLDER_COMPOSE = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    deploy:
      replicas: 1
`;

export function StacksPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: stacks, isLoading } = useStacks(endpointId);
  const deployStack = useDeployStack(endpointId);
  const removeStack = useRemoveStack(endpointId);

  const [deployOpen, setDeployOpen] = useState(false);
  const [stackName, setStackName] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');

  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  async function handleDeploy() {
    setDeployError('');
    if (!stackName.trim()) {
      setDeployError('Stack name is required.');
      return;
    }
    if (!composeContent.trim()) {
      setDeployError('Compose content is required.');
      return;
    }
    setDeploying(true);
    try {
      await deployStack.mutateAsync({ name: stackName.trim(), composeContent });
      setDeployOpen(false);
      setStackName('');
      setComposeContent('');
    } catch (err: any) {
      setDeployError(err?.message ?? 'Deploy failed.');
    } finally {
      setDeploying(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeStack.mutateAsync(removeTarget);
    } catch (err: any) {
      console.error('Remove stack error:', err);
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  async function handleEditOpen(name: string) {
    setEditName(name);
    setEditContent('');
    setEditError('');
    setEditOpen(true);
    // Try to fetch existing compose
    try {
      const res = await api.get(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}/compose`, {
        responseType: 'text',
        transformResponse: [(d: string) => d],
      });
      setEditContent(res.data as string);
    } catch {
      // No existing compose, start empty
    }
  }

  async function handleEdit() {
    setEditError('');
    if (!editContent.trim()) { setEditError('Compose content is required.'); return; }
    setEditing(true);
    try {
      await api.put(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(editName)}`, { composeContent: editContent });
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err?.response?.data?.message || err?.message || 'Update failed.');
    } finally {
      setEditing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading stacks...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stacks</h1>
        <Dialog open={deployOpen} onOpenChange={(open) => {
          setDeployOpen(open);
          if (!open) { setDeployError(''); }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setDeployOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Deploy Stack
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Deploy Stack</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Stack Name</label>
                <Input
                  value={stackName}
                  onChange={(e) => setStackName(e.target.value)}
                  placeholder="my-stack"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Compose File (YAML)
                </label>
                <textarea
                  className="w-full h-64 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  placeholder={PLACEHOLDER_COMPOSE}
                  spellCheck={false}
                />
              </div>
              {deployError && (
                <p className="text-sm text-destructive">{deployError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeployOpen(false)}
                disabled={deploying}
              >
                Cancel
              </Button>
              <Button onClick={handleDeploy} disabled={deploying}>
                {deploying ? 'Deploying...' : 'Deploy'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Services</th>
              <th className="text-left px-4 py-3 font-medium">Tasks</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(stacks ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground">
                  No stacks found.
                </td>
              </tr>
            )}
            {(stacks ?? []).map((stack: any) => {
              const name = stack.Name ?? stack.name ?? '—';
              const servicesCount = stack.Services ?? stack.services ?? 0;
              const tasksCount = stack.Tasks ?? stack.tasks ?? 0;

              return (
                <tr key={name} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/stacks/${encodeURIComponent(name)}`}
                      className="text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{servicesCount}</td>
                  <td className="px-4 py-3">{tasksCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditOpen(name)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRemoveTarget(name)}
                    >
                      Remove
                    </Button>
                  </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Stack</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove stack{' '}
            <span className="font-semibold text-foreground">{removeTarget}</span>? All services
            in the stack will be removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    {/* Edit Stack Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditError(''); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Stack: {editName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Compose File (YAML)</label>
              <textarea
                className="w-full h-64 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editing}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? 'Updating...' : 'Update Stack'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

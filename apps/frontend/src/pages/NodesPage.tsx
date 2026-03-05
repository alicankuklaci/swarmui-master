import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { useNodes, useUpdateNode, useRemoveNode } from '@/hooks/useDocker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';



export function NodesPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: nodes, isLoading } = useNodes(endpointId);
  const updateNode = useUpdateNode(endpointId);
  const removeNode = useRemoveNode(endpointId);

  const [removeTarget, setRemoveTarget] = useState<{ id: string; hostname: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  function handleSetAvailability(id: string, availability: string) {
    updateNode.mutate({ id, body: { availability } });
  }

  async function handleRemove(force = false) {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeNode.mutateAsync({ id: removeTarget.id, force });
    } catch (err: any) {
      console.error('Remove node error:', err);
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading nodes...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Nodes</h1>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Hostname</th>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Availability</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">IP Address</th>
              <th className="text-left px-4 py-3 font-medium">Platform</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(nodes ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">
                  No nodes found.
                </td>
              </tr>
            )}
            {(nodes ?? []).map((node: any) => {
              const isLeader = node.ManagerStatus?.Leader === true;
              const role = node.Spec?.Role ?? '—';
              const availability = node.Spec?.Availability ?? '—';
              const status = node.Status?.State ?? '—';
              const addr = node.Status?.Addr ?? '—';
              const os = node.Description?.Platform?.OS ?? '—';
              const arch = node.Description?.Platform?.Architecture ?? '';
              const hostname = node.Description?.Hostname ?? node.ID?.slice(0, 12) ?? '—';
              const shortId = (node.ID ?? '').slice(0, 12);

              return (
                <tr key={node.ID} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {hostname}
                    {isLeader && (
                      <Badge className="ml-2 text-xs" variant="secondary">
                        Leader
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{shortId}</td>
                  <td className="px-4 py-3 capitalize">{role}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={availability === 'active' ? 'default' : availability === 'drain' ? 'warning' : 'secondary'}
                      className="capitalize"
                    >
                      {availability}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={status === 'ready' ? 'default' : 'destructive'}
                      className="capitalize"
                    >
                      {status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{addr}</td>
                  <td className="px-4 py-3">
                    {os} {arch}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {availability !== 'drain' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetAvailability(node.ID, 'drain')}
                          disabled={updateNode.isPending}
                        >
                          Set Drain
                        </Button>
                      )}
                      {availability !== 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetAvailability(node.ID, 'active')}
                          disabled={updateNode.isPending}
                        >
                          Set Active
                        </Button>
                      )}
                      {availability !== 'pause' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetAvailability(node.ID, 'pause')}
                          disabled={updateNode.isPending}
                        >
                          Set Pause
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRemoveTarget({ id: node.ID, hostname })}
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
            <DialogTitle>Remove Node</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove node{' '}
            <span className="font-semibold text-foreground">{removeTarget?.hostname}</span>?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleRemove(true)}
              disabled={removing}
            >
              Force Remove
            </Button>
            <Button variant="destructive" onClick={() => handleRemove(false)} disabled={removing}>
              {removing ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

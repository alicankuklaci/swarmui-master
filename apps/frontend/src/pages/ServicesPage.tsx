import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices, useScaleService, useRemoveService } from '@/hooks/useDocker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PlusIcon } from 'lucide-react';



function formatPorts(ports: any[]): string {
  if (!ports || ports.length === 0) return '—';
  return ports
    .map((p: any) => `${p.PublishedPort ?? '?'}:${p.TargetPort ?? '?'}/${p.Protocol ?? 'tcp'}`)
    .join(', ');
}

function getReplicaDisplay(service: any): string {
  const mode = service.Spec?.Mode;
  if (mode?.Global !== undefined) return 'global';
  const replicas = mode?.Replicated?.Replicas ?? 0;
  const running = service.ServiceStatus?.RunningTasks ?? 0;
  return `${running}/${replicas}`;
}

function getMode(service: any): string {
  if (service.Spec?.Mode?.Global !== undefined) return 'Global';
  return 'Replicated';
}

function getImage(service: any): string {
  return service.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—';
}

function getUpdatedAt(service: any): string {
  const ts = service.UpdatedAt;
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function ServicesPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: services, isLoading } = useServices(endpointId);
  const scaleService = useScaleService(endpointId);
  const removeService = useRemoveService(endpointId);

  const [scaleTarget, setScaleTarget] = useState<{ id: string; name: string; current: number } | null>(null);
  const [replicaInput, setReplicaInput] = useState('');
  const [scaling, setScaling] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  function openScale(service: any) {
    const current = service.Spec?.Mode?.Replicated?.Replicas ?? 0;
    setReplicaInput(String(current));
    setScaleTarget({ id: service.ID, name: service.Spec?.Name ?? service.ID, current });
  }

  async function handleScale() {
    if (!scaleTarget) return;
    const replicas = parseInt(replicaInput, 10);
    if (isNaN(replicas) || replicas < 0) return;
    setScaling(true);
    try {
      await scaleService.mutateAsync({ id: scaleTarget.id, replicas });
    } catch (err: any) {
      console.error('Scale error:', err);
    } finally {
      setScaling(false);
      setScaleTarget(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeService.mutateAsync(removeTarget.id);
    } catch (err: any) {
      console.error('Remove service error:', err);
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading services...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Service</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Service creation via UI is not yet implemented. Use the Stacks page to deploy
              multi-service stacks, or use the Docker CLI directly.
            </p>
            <DialogFooter>
              <Button variant="outline">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Image</th>
              <th className="text-left px-4 py-3 font-medium">Mode</th>
              <th className="text-left px-4 py-3 font-medium">Replicas</th>
              <th className="text-left px-4 py-3 font-medium">Ports</th>
              <th className="text-left px-4 py-3 font-medium">Updated</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(services ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No services found.
                </td>
              </tr>
            )}
            {(services ?? []).map((service: any) => {
              const name = service.Spec?.Name ?? service.ID;
              const ports = service.Endpoint?.Ports ?? [];
              const mode = getMode(service);

              return (
                <tr key={service.ID} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/services/${service.ID}`}
                      className="text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate">
                    {getImage(service)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{mode}</Badge>
                  </td>
                  <td className="px-4 py-3">{getReplicaDisplay(service)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatPorts(ports)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {getUpdatedAt(service)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {mode === 'Replicated' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openScale(service)}
                        >
                          Scale
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRemoveTarget({ id: service.ID, name })}
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

      {/* Scale Dialog */}
      <Dialog open={!!scaleTarget} onOpenChange={(open) => { if (!open) setScaleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale Service</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Set the number of replicas for{' '}
            <span className="font-semibold text-foreground">{scaleTarget?.name}</span>.
          </p>
          <Input
            type="number"
            min={0}
            value={replicaInput}
            onChange={(e) => setReplicaInput(e.target.value)}
            placeholder="Number of replicas"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScaleTarget(null)} disabled={scaling}>
              Cancel
            </Button>
            <Button onClick={handleScale} disabled={scaling}>
              {scaling ? 'Scaling...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Service</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove service{' '}
            <span className="font-semibold text-foreground">{removeTarget?.name}</span>? This
            cannot be undone.
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
    </div>
  );
}

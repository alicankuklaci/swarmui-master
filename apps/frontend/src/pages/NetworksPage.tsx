import { useAppStore } from '@/stores/app.store';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNetworks, useCreateNetwork, useRemoveNetwork } from '@/hooks/useDocker';



// Docker built-in networks that cannot be removed
const BUILTIN_NETWORKS = new Set(['bridge', 'host', 'none']);

function getSubnet(network: any): string {
  try {
    const config = network.IPAM?.Config;
    if (config && config.length > 0 && config[0].Subnet) {
      return config[0].Subnet;
    }
  } catch {
    // ignore
  }
  return '-';
}

function getGateway(network: any): string {
  try {
    const config = network.IPAM?.Config;
    if (config && config.length > 0 && config[0].Gateway) {
      return config[0].Gateway;
    }
  } catch {
    // ignore
  }
  return '-';
}

function getContainerCount(network: any): number {
  try {
    const containers = network.Containers;
    if (containers && typeof containers === 'object') {
      return Object.keys(containers).length;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function NetworksPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const [createOpen, setCreateOpen] = useState(false);
  const [networkName, setNetworkName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailNetworkId, setDetailNetworkId] = useState<string | null>(null);

  const { data: networks = [], isLoading } = useNetworks(endpointId);
  const { data: networkContainers = [], isLoading: containersLoading } = useQuery({
    queryKey: ['network-containers', endpointId, detailNetworkId],
    queryFn: () => api.get(`/endpoints/${endpointId}/networks/${detailNetworkId}/containers`).then((r) => r.data?.data ?? r.data ?? []),
    enabled: !!endpointId && !!detailNetworkId,
  });
  const createMutation = useCreateNetwork(endpointId);
  const removeMutation = useRemoveNetwork(endpointId);

  function openCreate() {
    setNetworkName('');
    setDriver('bridge');
    setSubnet('');
    setGateway('');
    setCreateError(null);
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!networkName.trim()) return;
    try {
      setCreateError(null);
      const options: any = {};
      if (subnet.trim() || gateway.trim()) {
        options.IPAM = {
          Driver: 'default',
          Config: [
            {
              ...(subnet.trim() ? { Subnet: subnet.trim() } : {}),
              ...(gateway.trim() ? { Gateway: gateway.trim() } : {}),
            },
          ],
        };
      }
      await createMutation.mutateAsync({ name: networkName.trim(), driver, options });
      setCreateOpen(false);
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || 'Failed to create network');
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this network?')) return;
    try {
      setError(null);
      await removeMutation.mutateAsync(id);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove network');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Networks</h1>
          <p className="text-muted-foreground">Manage Docker networks</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Network
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
                <th className="text-left p-3 font-medium">Scope</th>
                <th className="text-left p-3 font-medium">Subnet</th>
                <th className="text-left p-3 font-medium">Gateway</th>
                <th className="text-left p-3 font-medium">Containers</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading networks...
                  </td>
                </tr>
              ) : !networks || networks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No networks found
                  </td>
                </tr>
              ) : (
                networks.map((network: any) => {
                  const isBuiltin = BUILTIN_NETWORKS.has(network.Name);
                  return (
                    <tr key={network.Id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium font-mono text-xs">{network.Name}</td>
                      <td className="p-3 text-muted-foreground">{network.Driver || '-'}</td>
                      <td className="p-3 text-muted-foreground">{network.Scope || '-'}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {getSubnet(network)}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {getGateway(network)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {getContainerCount(network)}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Details"
                            onClick={() => setDetailNetworkId(network.Id)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {!isBuiltin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Remove"
                              onClick={() => handleRemove(network.Id)}
                              disabled={removeMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Network Detail Dialog */}
      <Dialog open={!!detailNetworkId} onOpenChange={(open) => { if (!open) setDetailNetworkId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Network Containers</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {containersLoading ? (
              <p className="text-center py-4 text-muted-foreground">Loading...</p>
            ) : !networkContainers || networkContainers.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">No containers connected</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-2 font-medium">Container</th>
                    <th className="text-left p-2 font-medium">IPv4</th>
                    <th className="text-left p-2 font-medium">MAC</th>
                  </tr>
                </thead>
                <tbody>
                  {networkContainers.map((c: any) => (
                    <tr key={c.id} className="border-b">
                      <td className="p-2 font-mono text-xs">{c.name || c.id?.slice(0, 12)}</td>
                      <td className="p-2 font-mono text-xs">{c.ipv4 || '-'}</td>
                      <td className="p-2 font-mono text-xs">{c.mac || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Network Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Network</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="my-network"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Driver</label>
              <Select value={driver} onValueChange={setDriver}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge">bridge</SelectItem>
                  <SelectItem value="overlay">overlay</SelectItem>
                  <SelectItem value="host">host</SelectItem>
                  <SelectItem value="none">none</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subnet (optional)</label>
              <Input
                placeholder="e.g. 192.168.0.0/24"
                value={subnet}
                onChange={(e) => setSubnet(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Gateway (optional)</label>
              <Input
                placeholder="e.g. 192.168.0.1"
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
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
            <Button onClick={handleCreate} disabled={createMutation.isPending || !networkName.trim()}>
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

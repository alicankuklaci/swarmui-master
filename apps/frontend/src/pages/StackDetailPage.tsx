import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '@/stores/app.store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, CopyIcon, CheckIcon, PencilIcon } from 'lucide-react';
import Editor from '@monaco-editor/react';
import yaml from 'js-yaml';

function useStackDetail(endpointId: string, name: string) {
  return useQuery({
    queryKey: ['stack', endpointId, name],
    queryFn: () =>
      api
        .get(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}`)
        .then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && !!name,
    refetchInterval: 5000,
  });
}

function useComposeFile(endpointId: string, name: string) {
  return useQuery({
    queryKey: ['stack-compose', endpointId, name],
    queryFn: () =>
      api
        .get(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}/compose`, {
          responseType: 'text',
          transformResponse: [(data: string) => data],
        })
        .then((r) => r.data as string),
    enabled: !!endpointId && !!name,
    retry: false,
  });
}

export function StackDetailPage() {
  const { name } = useParams<{ name: string }>();
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: stack, isLoading, error } = useStackDetail(endpointId, name ?? '');
  const { data: composeContent } = useComposeFile(endpointId, name ?? '');
  const [copied, setCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');

  const editMutation = useMutation({
    mutationFn: (composeContent: string) =>
      api.put(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name ?? '')}`, { composeContent }),
    onSuccess: () => { setEditOpen(false); setEditError(''); },
    onError: (e: any) => setEditError(e?.response?.data?.message || e?.message || 'Update failed'),
  });

  function handleDeploy() {
    try {
      yaml.load(editContent);
    } catch (e: any) {
      setEditError(`YAML Error: ${e.message}`);
      return;
    }
    setEditError('');
    editMutation.mutate(editContent);
  }

  const defaultCompose = 'version: "3.8"\nservices:\n  # Add your services here\n';

  function openEdit() {
    setEditContent(composeContent || defaultCompose);
    setEditError('');
    setEditOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading stack details...</p>
      </div>
    );
  }

  if (error || !stack) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/stacks">
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Stacks
          </Button>
        </Link>
        <p className="text-destructive">Failed to load stack details.</p>
      </div>
    );
  }

  const services = stack.services ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/stacks">
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{stack.name ?? name}</h1>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <PencilIcon className="h-4 w-4 mr-2" />
          Edit Stack
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Service</th>
              <th className="text-left px-4 py-3 font-medium">Image</th>
              <th className="text-left px-4 py-3 font-medium">Replicas</th>
              <th className="text-left px-4 py-3 font-medium">Ports</th>
              <th className="text-left px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">
                  No services in this stack.
                </td>
              </tr>
            )}
            {services.map((svc: any) => {
              const svcName = svc.name ?? svc.Spec?.Name ?? svc.ID ?? '—';
              const image = svc.image ?? svc.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—';
              const running = svc.replicas?.running ?? svc.ServiceStatus?.RunningTasks ?? 0;
              const desired = svc.replicas?.desired ?? svc.Spec?.Mode?.Replicated?.Replicas ?? 1;
              const ports = svc.ports ?? svc.Endpoint?.Ports ?? [];
              const updatedAt = svc.updatedAt ?? svc.UpdatedAt;

              return (
                <tr key={svc.id ?? svc.ID ?? svcName} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {svc.id || svc.ID ? (
                      <Link
                        to={`/services/${svc.id ?? svc.ID}`}
                        className="text-primary hover:underline"
                      >
                        {svcName}
                      </Link>
                    ) : (
                      svcName
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[250px] truncate">{image}</td>
                  <td className="px-4 py-3">
                    <Badge variant={running >= desired ? 'default' : 'destructive'}>
                      {running}/{desired}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {ports.length === 0
                      ? '—'
                      : ports
                          .map(
                            (p: any) =>
                              `${p.PublishedPort ?? '?'}:${p.TargetPort ?? '?'}/${p.Protocol ?? 'tcp'}`,
                          )
                          .join(', ')}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compose File */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compose File</h2>
          {composeContent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(composeContent);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 mr-1" />
              ) : (
                <CopyIcon className="h-4 w-4 mr-1" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
        {composeContent ? (
          <pre className="bg-muted rounded p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {composeContent}
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm">No compose file stored.</p>
        )}
      </div>
      {/* Edit Stack Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Stack: {name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-md overflow-hidden">
              <Editor
                height="500px"
                language="yaml"
                theme="vs-dark"
                value={editContent}
                onChange={(v) => setEditContent(v ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 2,
                }}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editMutation.isPending}>Cancel</Button>
            <Button onClick={handleDeploy} disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Deploying...' : 'Deploy Stack'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

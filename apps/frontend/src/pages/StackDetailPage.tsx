import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useAppStore } from '@/stores/app.store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, CopyIcon, CheckIcon, PencilIcon, XIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import yaml from 'js-yaml';

function useEndpoints() {
  return useQuery({
    queryKey: ['endpoints'],
    queryFn: () => api.get('/endpoints').then((r) => r.data?.data ?? r.data ?? []),
    staleTime: 30000,
  });
}

function useStackDetail(endpointId: string, name: string) {
  return useQuery({
    queryKey: ['stack', endpointId, name],
    queryFn: () =>
      api.get(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}`).then((r) => r.data?.data ?? r.data),
    enabled: !!endpointId && !!name,
    refetchInterval: 5000,
  });
}

function useComposeFile(endpointId: string, name: string) {
  return useQuery({
    queryKey: ['stack-compose', endpointId, name],
    queryFn: async () => {
      const r = await api.get(
        `/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}/compose`,
        { responseType: 'text', transformResponse: [(d: unknown) => d], headers: { Accept: 'text/plain, */*' } }
      );
      return typeof r.data === 'string' ? r.data : (r.data?.data ?? String(r.data ?? ''));
    },
    enabled: !!endpointId && !!name,
    retry: 1,
  });
}

export function StackDetailPage() {
  const { name } = useParams<{ name: string }>();
  const selectedEndpointId = useAppStore((s) => s.selectedEndpointId);
  const setSelectedEndpoint = useAppStore((s) => s.setSelectedEndpoint);
  const { data: endpoints = [] } = useEndpoints();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedEndpointId && Array.isArray(endpoints) && endpoints.length > 0) {
      setSelectedEndpoint(endpoints[0].id ?? endpoints[0]._id ?? '');
    }
  }, [endpoints, selectedEndpointId, setSelectedEndpoint]);

  const endpointId = (selectedEndpointId ?? (Array.isArray(endpoints) && endpoints[0]?.id) ?? '') as string;
  const { data: stack, isLoading, error } = useStackDetail(endpointId, name ?? '');
  const { data: composeContent } = useComposeFile(endpointId, name ?? '');

  const [copied, setCopied] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');
  const [yamlValid, setYamlValid] = useState<boolean | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  const editMutation = useMutation({
    mutationFn: (content: string) =>
      api.put(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name ?? '')}`, { composeContent: content }),
    onSuccess: () => {
      setEditMode(false);
      setEditError('');
      setDeploySuccess(true);
      setTimeout(() => setDeploySuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['stack', endpointId, name] });
      queryClient.invalidateQueries({ queryKey: ['stack-compose', endpointId, name] });
    },
    onError: (e: any) => setEditError(e?.response?.data?.message || e?.message || 'Deploy failed'),
  });

  function validateYaml(content: string) {
    try { yaml.load(content); setYamlValid(true); setEditError(''); }
    catch (e: any) { setYamlValid(false); setEditError(`YAML Hatası: ${e.message}`); }
  }

  function handleContentChange(val: string) {
    setEditContent(val);
    setYamlValid(null);
    setEditError('');
  }

  function openEdit() {
    setEditContent(composeContent || 'version: "3.8"\nservices:\n  # servislerinizi buraya ekleyin\n');
    setEditError(''); setYamlValid(null); setEditMode(true);
  }

  function handleDeploy() {
    try { yaml.load(editContent); }
    catch (e: any) { setEditError(`YAML Hatası: ${e.message}`); return; }
    editMutation.mutate(editContent);
  }

  if (isLoading || (!endpointId && (!Array.isArray(endpoints) || endpoints.length === 0))) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Yükleniyor...</p></div>;
  }

  if (error || !stack) {
    return (
      <div className="p-6 space-y-4">
        <Link to="/stacks"><Button variant="ghost" size="sm"><ArrowLeftIcon className="h-4 w-4 mr-2" />Geri</Button></Link>
        <p className="text-destructive">Stack yüklenemedi.</p>
      </div>
    );
  }

  const services = stack.services ?? [];

  // ── TAM SAYFA EDİTÖR MODU ──────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
              <XIcon className="h-4 w-4 mr-1" />Kapat
            </Button>
            <h1 className="text-lg font-semibold">Stack Düzenle: <span className="text-primary">{name}</span></h1>
          </div>
          <div className="flex items-center gap-2">
            {/* YAML Doğrulama butonu */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateYaml(editContent)}
            >
              {yamlValid === true
                ? <><CheckCircleIcon className="h-4 w-4 mr-1 text-green-500" />Geçerli</>
                : yamlValid === false
                  ? <><AlertCircleIcon className="h-4 w-4 mr-1 text-destructive" />Hatalı</>
                  : 'YAML Doğrula'}
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={editMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {editMutation.isPending ? 'Deploy ediliyor...' : '🚀 Deploy Et'}
            </Button>
          </div>
        </div>

        {/* Hata / başarı bandı */}
        {editError && (
          <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/30 text-sm text-destructive font-mono shrink-0">
            ⚠️ {editError}
          </div>
        )}
        {yamlValid === true && !editError && (
          <div className="px-6 py-2 bg-green-500/10 border-b border-green-500/30 text-sm text-green-400 shrink-0">
            ✅ YAML geçerli
          </div>
        )}

        {/* Editör */}
        <textarea
          value={editContent}
          onChange={(e) => handleContentChange(e.target.value)}
          spellCheck={false}
          autoFocus
          className="flex-1 w-full bg-gray-950 text-gray-100 font-mono text-sm p-6 resize-none focus:outline-none"
          style={{ tabSize: 2, lineHeight: '1.6' }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const s = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const v = editContent.substring(0, s) + '  ' + editContent.substring(end);
              setEditContent(v);
              requestAnimationFrame(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = s + 2; });
            }
          }}
        />

        {/* Alt bilgi */}
        <div className="px-6 py-2 border-t bg-card text-xs text-muted-foreground shrink-0 flex gap-6">
          <span>Tab → 2 boşluk</span>
          <span>Satır: {editContent.split('\n').length}</span>
          <span>Karakter: {editContent.length}</span>
        </div>
      </div>
    );
  }

  // ── NORMAL GÖRÜNÜM ─────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      {deploySuccess && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">
          ✅ Stack başarıyla deploy edildi!
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link to="/stacks"><Button variant="ghost" size="sm"><ArrowLeftIcon className="h-4 w-4 mr-2" />Geri</Button></Link>
        <h1 className="text-2xl font-bold">{stack.name ?? name}</h1>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <PencilIcon className="h-4 w-4 mr-2" />Stack Düzenle
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Servis</th>
              <th className="text-left px-4 py-3 font-medium">Image</th>
              <th className="text-left px-4 py-3 font-medium">Replika</th>
              <th className="text-left px-4 py-3 font-medium">Port</th>
              <th className="text-left px-4 py-3 font-medium">Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Bu stack'te servis yok.</td></tr>
            )}
            {services.map((svc: any) => {
              const svcName = svc.name ?? svc.Spec?.Name ?? svc.ID ?? '—';
              const image = svc.image ?? svc.Spec?.TaskTemplate?.ContainerSpec?.Image?.split('@')[0] ?? '—';
              const running = svc.replicas?.running ?? 0;
              const desired = svc.replicas?.desired ?? 1;
              const ports = svc.ports ?? svc.Endpoint?.Ports ?? [];
              const updatedAt = svc.updatedAt ?? svc.UpdatedAt;
              return (
                <tr key={svc.id ?? svc.ID ?? svcName} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {svc.id || svc.ID
                      ? <Link to={`/services/${svc.id ?? svc.ID}`} className="text-primary hover:underline">{svcName}</Link>
                      : svcName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[250px] truncate">{image}</td>
                  <td className="px-4 py-3">
                    <Badge variant={running >= desired ? 'default' : 'destructive'}>{running}/{desired}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {ports.length === 0 ? '—' : ports.map((p: any) => `${p.PublishedPort}:${p.TargetPort}/${p.Protocol ?? 'tcp'}`).join(', ')}
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

      {/* Compose dosyası */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compose Dosyası</h2>
          {composeContent && (
            <Button variant="outline" size="sm" onClick={() => {
              navigator.clipboard.writeText(composeContent);
              setCopied(true); setTimeout(() => setCopied(false), 2000);
            }}>
              {copied ? <CheckIcon className="h-4 w-4 mr-1" /> : <CopyIcon className="h-4 w-4 mr-1" />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          )}
        </div>
        {composeContent
          ? <pre className="bg-muted rounded p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">{composeContent}</pre>
          : <p className="text-muted-foreground text-sm">Compose dosyası bulunamadı.</p>}
      </div>
    </div>
  );
}

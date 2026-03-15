import { useAppStore } from '@/stores/app.store';
import { api } from '@/lib/api';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStacks, useDeployStack, useRemoveStack } from '@/hooks/useDocker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PlusIcon, PencilIcon, Trash2Icon, XIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import yaml from 'js-yaml';

const PLACEHOLDER = `version: "3.8"
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    deploy:
      replicas: 1
`;

type EditorMode = 'none' | 'new' | 'edit';

export function StacksPage() {
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const { data: stacks = [], isLoading, refetch } = useStacks(endpointId);
  const deployStack = useDeployStack(endpointId);
  const removeStack = useRemoveStack(endpointId);

  // Tam sayfa editör
  const [editorMode, setEditorMode] = useState<EditorMode>('none');
  const [stackName, setStackName] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [yamlValid, setYamlValid] = useState<boolean | null>(null);
  const [deployError, setDeployError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  function openNew() {
    setStackName(''); setComposeContent(PLACEHOLDER);
    setYamlValid(null); setDeployError(''); setForceUpdate(false);
    setEditorMode('new');
  }

  async function openEdit(name: string) {
    setStackName(name); setComposeContent('');
    setYamlValid(null); setDeployError(''); setForceUpdate(false);
    setEditorMode('edit');
    try {
      const res = await api.get(
        `/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(name)}/compose`,
        { responseType: 'text', transformResponse: [(d: unknown) => d], headers: { Accept: 'text/plain, */*' } }
      );
      setComposeContent(typeof res.data === 'string' ? res.data : String(res.data ?? PLACEHOLDER));
    } catch {
      setComposeContent(PLACEHOLDER);
    }
  }

  function validateYaml() {
    try { yaml.load(composeContent); setYamlValid(true); setDeployError(''); }
    catch (e: any) { setYamlValid(false); setDeployError(`YAML Hatası: ${e.message}`); }
  }

  async function handleDeploy() {
    setDeployError('');
    if (!stackName.trim()) { setDeployError('Stack adı gerekli.'); return; }
    try { yaml.load(composeContent); } catch (e: any) { setDeployError(`YAML Hatası: ${e.message}`); return; }

    setDeploying(true);
    try {
      if (editorMode === 'new') {
        await deployStack.mutateAsync({ name: stackName.trim(), composeContent });
      } else {
        // Update — force update ile
        await api.put(
          `/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(stackName)}`,
          { composeContent, forceUpdate }
        );
        if (forceUpdate) {
          // Servis başına force update — backend desteklemiyorsa frontend'den yap
          try {
            const svcRes = await api.get(`/endpoints/${endpointId}/swarm/stacks/${encodeURIComponent(stackName)}`);
            const services = svcRes.data?.data?.services ?? svcRes.data?.services ?? [];
            for (const svc of services) {
              const svcId = svc.id ?? svc.ID;
              if (svcId) {
                await api.post(`/endpoints/${endpointId}/swarm/services/${svcId}/force-update`).catch(() =>
                  // fallback: service update via swarm API
                  api.patch(`/endpoints/${endpointId}/swarm/services/${svcId}`, { forceUpdate: true }).catch(() => {})
                );
              }
            }
          } catch { /* non-critical */ }
        }
      }
      setEditorMode('none');
      refetch();
    } catch (err: any) {
      setDeployError(err?.response?.data?.message ?? err?.message ?? 'Deploy başarısız.');
    } finally {
      setDeploying(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try { await removeStack.mutateAsync(removeTarget); }
    catch (e: any) { console.error(e); }
    finally { setRemoving(false); setRemoveTarget(null); }
  }

  // ── TAM SAYFA EDİTÖR ──────────────────────────────────────────────────
  if (editorMode !== 'none') {
    return (
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditorMode('none')}>
              <XIcon className="h-4 w-4 mr-1" />Kapat
            </Button>
            <h1 className="text-lg font-semibold">
              {editorMode === 'new' ? 'Yeni Stack Deploy Et' : `Stack Düzenle: `}
              {editorMode === 'edit' && <span className="text-primary">{stackName}</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {editorMode === 'edit' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceUpdate}
                  onChange={e => setForceUpdate(e.target.checked)}
                  className="rounded"
                />
                Force Update (image yeniden çek)
              </label>
            )}
            <Button variant="outline" size="sm" onClick={validateYaml}>
              {yamlValid === true
                ? <><CheckCircleIcon className="h-4 w-4 mr-1 text-green-500" />Geçerli</>
                : yamlValid === false
                  ? <><AlertCircleIcon className="h-4 w-4 mr-1 text-destructive" />Hatalı</>
                  : 'YAML Doğrula'}
            </Button>
            <Button onClick={handleDeploy} disabled={deploying} className="bg-blue-600 hover:bg-blue-700 text-white">
              {deploying ? 'Deploy ediliyor...' : '🚀 Deploy Et'}
            </Button>
          </div>
        </div>

        {/* Stack adı (yeni stack için) */}
        {editorMode === 'new' && (
          <div className="px-6 py-3 border-b bg-card shrink-0">
            <Input
              value={stackName}
              onChange={e => setStackName(e.target.value)}
              placeholder="stack-adı"
              className="max-w-xs font-mono"
            />
          </div>
        )}

        {/* Hata / başarı bandı */}
        {deployError && (
          <div className="px-6 py-2 bg-destructive/10 border-b border-destructive/30 text-sm text-destructive font-mono shrink-0">
            ⚠️ {deployError}
          </div>
        )}
        {yamlValid === true && !deployError && (
          <div className="px-6 py-2 bg-green-500/10 border-b border-green-500/30 text-sm text-green-400 shrink-0">
            ✅ YAML geçerli
          </div>
        )}

        {/* Editör */}
        <textarea
          value={composeContent}
          onChange={e => { setComposeContent(e.target.value); setYamlValid(null); setDeployError(''); }}
          spellCheck={false}
          autoFocus
          className="flex-1 w-full bg-gray-950 text-gray-100 font-mono text-sm p-6 resize-none focus:outline-none"
          style={{ tabSize: 2, lineHeight: '1.6' }}
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const s = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const v = composeContent.substring(0, s) + '  ' + composeContent.substring(end);
              setComposeContent(v);
              requestAnimationFrame(() => { e.currentTarget.selectionStart = e.currentTarget.selectionEnd = s + 2; });
            }
          }}
        />

        {/* Alt bilgi */}
        <div className="px-6 py-2 border-t bg-card text-xs text-muted-foreground shrink-0 flex gap-6">
          <span>Tab → 2 boşluk</span>
          <span>Satır: {composeContent.split('\n').length}</span>
          <span>Karakter: {composeContent.length}</span>
        </div>
      </div>
    );
  }

  // ── STACK LİSTESİ ───────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stacks</h1>
        <Button onClick={openNew}>
          <PlusIcon className="h-4 w-4 mr-2" />Deploy Stack
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">Yükleniyor...</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Ad</th>
                <th className="text-left px-4 py-3 font-medium">Servisler</th>
                <th className="text-left px-4 py-3 font-medium">Tasks</th>
                <th className="text-left px-4 py-3 font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {(stacks ?? []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Stack bulunamadı.</td></tr>
              )}
              {(stacks ?? []).map((stack: any) => {
                const n = stack.Name ?? stack.name ?? '—';
                return (
                  <tr key={n} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/stacks/${encodeURIComponent(n)}`} className="text-primary hover:underline">{n}</Link>
                    </td>
                    <td className="px-4 py-3">{stack.Services ?? stack.services ?? 0}</td>
                    <td className="px-4 py-3">{stack.Tasks ?? stack.tasks ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(n)}>
                          <PencilIcon className="h-3 w-3 mr-1" />Düzenle
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(n)}>
                          <Trash2Icon className="h-3 w-3 mr-1" />Kaldır
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Remove Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stack Kaldır</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{removeTarget}</span> stack'i kaldırılsın mı? Tüm servisler silinecek.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>İptal</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? 'Kaldırılıyor...' : 'Kaldır'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

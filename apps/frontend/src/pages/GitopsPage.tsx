import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/app.store';
import { Plus, Trash2, Play, RefreshCw, Webhook, GitBranch, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { format } from 'date-fns';

const STATUS_ICON: Record<string, any> = {
  idle: <RefreshCw className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

const emptyForm = { name: '', deployType: 'stack', repoUrl: '', branch: 'main', composePath: 'docker-compose.yml', gitCredentialsId: '', pollingIntervalMinutes: 5, autoUpdate: true, changeWindowEnabled: false, changeWindowStart: '09:00', changeWindowEnd: '18:00', changeWindowDays: [1,2,3,4,5] };
const emptyCredForm = { name: '', type: 'pat', username: '', token: '', description: '' };

export function GitopsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedEndpointId } = useAppStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [histOpen, setHistOpen] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [credForm, setCredForm] = useState(emptyCredForm);

  const { data: deployments, isLoading } = useQuery({
    queryKey: ['gitops'],
    queryFn: () => api.get('/gitops').then(r => r.data.data),
    refetchInterval: 10000,
  });

  const { data: credentials } = useQuery({
    queryKey: ['git-credentials'],
    queryFn: () => api.get('/gitops/credentials/list').then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/gitops', body),
    onSuccess: () => { toast({ title: 'GitOps deployment oluşturuldu' }); qc.invalidateQueries({ queryKey: ['gitops'] }); setCreateOpen(false); setForm(emptyForm); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Hata', description: e.response?.data?.message || e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/gitops/${id}`),
    onSuccess: () => { toast({ title: 'Silindi' }); qc.invalidateQueries({ queryKey: ['gitops'] }); },
  });

  const deployMutation = useMutation({
    mutationFn: (id: string) => api.post(`/gitops/${id}/deploy`),
    onSuccess: () => { toast({ title: 'Deploy tetiklendi' }); qc.invalidateQueries({ queryKey: ['gitops'] }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Hata', description: e.response?.data?.message || e.message }),
  });

  const createCredMutation = useMutation({
    mutationFn: (body: any) => api.post('/gitops/credentials', body),
    onSuccess: () => { toast({ title: 'Git kimliği eklendi' }); qc.invalidateQueries({ queryKey: ['git-credentials'] }); setCredOpen(false); setCredForm(emptyCredForm); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Hata', description: e.response?.data?.message || e.message }),
  });

  const deps = deployments ?? [];
  const creds = credentials ?? [];
  const baseUrl = window.location.origin;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GitOps</h1>
          <p className="text-sm text-muted-foreground mt-1">Git repo'dan otomatik deploy — webhook & polling destekli</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCredOpen(true)}>🔑 Git Kimliği</Button>
          <Button onClick={() => { setCreateOpen(true); setForm(emptyForm); }}><Plus className="h-4 w-4 mr-2" />Deployment Ekle</Button>
        </div>
      </div>

      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">Deployments ({deps.length})</TabsTrigger>
          <TabsTrigger value="credentials">Git Credentials ({creds.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-4">
          {isLoading ? <p className="text-muted-foreground text-sm py-12 text-center">Yükleniyor...</p>
            : deps.length === 0 ? (
              <div className="border rounded-lg p-12 text-center">
                <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Git repo bağlı değil</p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />İlk Deployment'ı Ekle</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {deps.map((dep: any) => (
                  <div key={dep._id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">{STATUS_ICON[dep.status] ?? STATUS_ICON.idle}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{dep.name}</span>
                          <Badge variant="secondary">{dep.deployType}</Badge>
                          {dep.autoUpdate && <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Her {dep.pollingIntervalMinutes}dk</Badge>}
                          <Badge className={dep.status === 'success' ? 'bg-green-100 text-green-700' : dep.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}>{dep.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{dep.repoUrl} @ {dep.branch}</p>
                        {dep.composePath && <p className="text-xs text-muted-foreground">📄 {dep.composePath}</p>}
                        {dep.lastDeployedAt && <p className="text-xs text-muted-foreground mt-1">Son deploy: {format(new Date(dep.lastDeployedAt), 'dd.MM.yy HH:mm')} {dep.lastCommitSha && `• ${dep.lastCommitSha.slice(0,7)}`}</p>}
                        {dep.lastError && <p className="text-xs text-red-500 mt-1">⚠ {dep.lastError}</p>}

                        {/* Webhook URL */}
                        <div className="mt-2 flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
                          <Webhook className="h-3 w-3 text-muted-foreground shrink-0" />
                          <code className="text-xs truncate flex-1">{baseUrl}/api/v1/gitops/webhooks/{dep.webhookToken}</code>
                          <button className="text-xs text-primary shrink-0" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/api/v1/gitops/webhooks/${dep.webhookToken}`); toast({ title: 'Kopyalandı' }); }}>Kopyala</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setHistOpen(dep)}>Geçmiş</Button>
                        <Button size="sm" onClick={() => deployMutation.mutate(dep._id)} disabled={deployMutation.isPending}>
                          <Play className="h-4 w-4 mr-1" /> Deploy
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(dep._id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </TabsContent>

        <TabsContent value="credentials" className="mt-4">
          {creds.length === 0 ? (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-muted-foreground text-sm">Git credentials eklenmemiş</p>
              <Button className="mt-3" variant="outline" onClick={() => setCredOpen(true)}>🔑 Credential Ekle</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {creds.map((c: any) => (
                <div key={c._id} className="border rounded-lg p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="secondary" className="ml-2">{c.type === 'pat' ? 'Personal Access Token' : 'SSH Key'}</Badge>
                    {c.username && <span className="text-xs text-muted-foreground ml-2">@ {c.username}</span>}
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => api.delete(`/gitops/credentials/${c._id}`).then(() => qc.invalidateQueries({ queryKey: ['git-credentials'] }))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Deployment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>GitOps Deployment Ekle</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1"><Label>İsim</Label><Input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="my-app" /></div>
            <div className="space-y-1"><Label>Deploy Tipi</Label>
              <Select value={form.deployType} onValueChange={v=>setForm(f=>({...f,deployType:v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="stack">Stack (docker-compose)</SelectItem><SelectItem value="service">Service</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Repository URL</Label><Input value={form.repoUrl} onChange={e=>setForm(f=>({...f,repoUrl:e.target.value}))} placeholder="https://github.com/user/repo" className="font-mono text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Branch</Label><Input value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))} placeholder="main" /></div>
              <div className="space-y-1"><Label>Compose Dosyası</Label><Input value={form.composePath} onChange={e=>setForm(f=>({...f,composePath:e.target.value}))} placeholder="docker-compose.yml" /></div>
            </div>
            <div className="space-y-1"><Label>Git Credential (opsiyonel)</Label>
              <Select value={form.gitCredentialsId || 'none'} onValueChange={v=>setForm(f=>({...f,gitCredentialsId:v==='none'?'':v}))}>
                <SelectTrigger><SelectValue placeholder="Public repo / Credential seç" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Public repo (gerekmez)</SelectItem>
                  {creds.map((c:any)=><SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Polling (dakika)</Label><Input type="number" min={1} max={1440} value={form.pollingIntervalMinutes} onChange={e=>setForm(f=>({...f,pollingIntervalMinutes:parseInt(e.target.value)||5}))} /></div>
              <div className="space-y-1"><Label>Otomatik Update</Label>
                <Select value={form.autoUpdate?'true':'false'} onValueChange={v=>setForm(f=>({...f,autoUpdate:v==='true'}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Aktif (polling)</SelectItem><SelectItem value="false">Sadece webhook / manual</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cwEnabled" checked={form.changeWindowEnabled} onChange={e=>setForm(f=>({...f,changeWindowEnabled:e.target.checked}))} className="rounded" />
                <Label htmlFor="cwEnabled" className="cursor-pointer">Change Window (belirli saatlerde deploy)</Label>
              </div>
              {form.changeWindowEnabled && (
                <div className="pl-5 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Başlangıç</Label><Input type="time" value={form.changeWindowStart} onChange={e=>setForm(f=>({...f,changeWindowStart:e.target.value}))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Bitiş</Label><Input type="time" value={form.changeWindowEnd} onChange={e=>setForm(f=>({...f,changeWindowEnd:e.target.value}))} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Günler</Label>
                    <div className="flex gap-1 flex-wrap">
                      {['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'].map((d,i)=>(
                        <button key={i} type="button"
                          onClick={()=>setForm(f=>({...f,changeWindowDays:f.changeWindowDays.includes(i)?f.changeWindowDays.filter((x:number)=>x!==i):[...f.changeWindowDays,i]}))}
                          className={`px-2 py-1 text-xs rounded border ${form.changeWindowDays.includes(i)?'bg-primary text-primary-foreground border-primary':'bg-background border-border'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setCreateOpen(false)}>İptal</Button>
            <Button onClick={()=>createMutation.mutate({...form,endpointId:selectedEndpointId})} disabled={createMutation.isPending||!form.name||!form.repoUrl}>
              {createMutation.isPending?'Oluşturuluyor...':'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Git Credential Dialog */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Git Credential Ekle</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>İsim</Label><Input value={credForm.name} onChange={e=>setCredForm(f=>({...f,name:e.target.value}))} placeholder="GitHub PAT" /></div>
            <div className="space-y-1"><Label>Tür</Label>
              <Select value={credForm.type} onValueChange={v=>setCredForm(f=>({...f,type:v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pat">Personal Access Token</SelectItem><SelectItem value="ssh">SSH Key</SelectItem></SelectContent>
              </Select>
            </div>
            {credForm.type === 'pat' && <>
              <div className="space-y-1"><Label>Kullanıcı Adı</Label><Input value={credForm.username} onChange={e=>setCredForm(f=>({...f,username:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Token</Label><Input type="password" value={credForm.token} onChange={e=>setCredForm(f=>({...f,token:e.target.value}))} placeholder="ghp_..." /></div>
            </>}
            <div className="space-y-1"><Label>Açıklama (opsiyonel)</Label><Input value={credForm.description} onChange={e=>setCredForm(f=>({...f,description:e.target.value}))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setCredOpen(false)}>İptal</Button>
            <Button onClick={()=>createCredMutation.mutate(credForm)} disabled={createCredMutation.isPending||!credForm.name||!credForm.token}>
              {createCredMutation.isPending?'Kaydediliyor...':'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy History Dialog */}
      <Dialog open={!!histOpen} onOpenChange={()=>setHistOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>📋 {histOpen?.name} — Deploy Geçmişi</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {(histOpen?.deployHistory ?? []).length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">Henüz deploy yok</p>
              : [...(histOpen?.deployHistory ?? [])].reverse().map((h:any, i:number) => (
                <div key={i} className={`border rounded p-3 ${h.status==='success'?'border-green-200 bg-green-50':'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {h.status==='success'?<CheckCircle className="h-4 w-4 text-green-600"/>:<XCircle className="h-4 w-4 text-red-600"/>}
                    <code className="text-xs font-mono">{h.commitSha?.slice(0,7)}</code>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{h.commitMessage}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{h.deployedAt ? format(new Date(h.deployedAt),'dd.MM.yy HH:mm') : ''}</span>
                  </div>
                  {h.error && <p className="text-xs text-red-600 mt-1 ml-6">{h.error}</p>}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GitopsPage;

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Plus, Trash2, TestTube, BookOpen, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';

const REGISTRY_TYPES = [
  { value: 'dockerhub', label: 'Docker Hub', url: 'https://registry-1.docker.io' },
  { value: 'gcr', label: 'Google Container Registry', url: 'https://gcr.io' },
  { value: 'ecr', label: 'AWS ECR', url: '' },
  { value: 'acr', label: 'Azure Container Registry', url: '' },
  { value: 'gitlab', label: 'GitLab Registry', url: 'https://registry.gitlab.com' },
  { value: 'quay', label: 'Quay.io', url: 'https://quay.io' },
  { value: 'custom', label: 'Custom / Self-hosted', url: '' },
];

const emptyForm = { name: '', type: 'dockerhub', url: 'https://registry-1.docker.io', username: '', password: '', authentication: true };

export function RegistriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState<any>(null);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [testing, setTesting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['registries'],
    queryFn: () => api.get('/registries').then(r => r.data?.data ?? []),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['registry-catalog', catalogOpen?._id],
    queryFn: () => api.get(`/registries/${catalogOpen._id}/catalog`).then(r => r.data?.data ?? []),
    enabled: !!catalogOpen,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/registries', body),
    onSuccess: () => { toast({ title: 'Registry eklendi' }); qc.invalidateQueries({ queryKey: ['registries'] }); setCreateOpen(false); setForm(emptyForm); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Hata', description: e.response?.data?.message || e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/registries/${id}`),
    onSuccess: () => { toast({ title: 'Registry silindi' }); qc.invalidateQueries({ queryKey: ['registries'] }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Hata', description: e.response?.data?.message || e.message }),
  });

  const testAuth = async (id: string) => {
    setTesting(id);
    try {
      await api.post(`/registries/${id}/test`);
      toast({ title: '✓ Bağlantı başarılı', description: 'Registry kimlik doğrulama çalışıyor' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Bağlantı başarısız', description: e.response?.data?.message || e.message });
    } finally { setTesting(null); }
  };

  const handleTypeChange = (type: string) => {
    const t = REGISTRY_TYPES.find(r => r.value === type);
    setForm(f => ({ ...f, type, url: t?.url || '' }));
  };

  const registries = data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registries</h1>
          <p className="text-sm text-muted-foreground mt-1">Private container registry kimlik bilgilerini yönet</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setForm(emptyForm); }}>
          <Plus className="h-4 w-4 mr-2" /> Registry Ekle
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm py-12 text-center">Yükleniyor...</p>
      ) : registries.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">Henüz registry eklenmemiş</p>
          <p className="text-xs text-muted-foreground mt-1">Docker Hub, ECR, GCR veya özel registry ekle</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />İlk Registryi Ekle</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {registries.map((reg: any) => (
            <div key={reg._id} className="border rounded-lg p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{reg.name}</span>
                  <Badge variant="secondary">{REGISTRY_TYPES.find(t => t.value === reg.type)?.label || reg.type}</Badge>
                  {reg.authentication && <Badge variant="outline">🔐 Auth</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{reg.url}</p>
                {reg.username && <p className="text-xs text-muted-foreground">Kullanıcı: {reg.username}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => testAuth(reg._id)} disabled={testing === reg._id}>
                  <TestTube className="h-4 w-4 mr-1" />
                  {testing === reg._id ? 'Test...' : 'Test'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCatalogOpen(reg)}>
                  <BookOpen className="h-4 w-4 mr-1" /> Catalog
                </Button>
                <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(reg._id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registry Ekle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>İsim</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Docker Hub" />
            </div>
            <div className="space-y-1">
              <Label>Tür</Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REGISTRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Registry URL</Label>
              <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://registry.example.com" className="font-mono text-sm" />
            </div>
            <div className="border-t pt-4 space-y-3">
              <Label className="font-semibold">Kimlik Doğrulama</Label>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Kullanıcı Adı / Access Key ID</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Şifre / Token / Secret</Label>
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button onClick={() => createMutation.mutate({ ...form, passwordEncrypted: form.password })} disabled={createMutation.isPending || !form.name || !form.url}>
              {createMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Catalog Dialog */}
      <Dialog open={!!catalogOpen} onOpenChange={() => setCatalogOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>📦 {catalogOpen?.name} — Catalog</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {!catalog ? <p className="text-muted-foreground text-sm">Yükleniyor...</p>
              : (catalog.repositories ?? catalog)?.length === 0 ? <p className="text-muted-foreground text-sm">Catalog boş</p>
              : (catalog.repositories ?? catalog).map((img: string, i: number) => (
                <div key={i} className="px-3 py-1.5 rounded hover:bg-muted font-mono text-sm">{img}</div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RegistriesPage;

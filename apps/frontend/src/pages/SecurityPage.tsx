import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search, ScanLine, CheckCircle, XCircle, Key, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/useToast';
import { useAppStore } from '@/stores/app.store';

const severityVariant: Record<string, any> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'warning',
  LOW: 'secondary',
  UNKNOWN: 'outline',
};

export function SecurityPage() {
  const queryClient = useQueryClient();
  const endpointId = useAppStore((s) => s.selectedEndpointId) ?? '';
  const [scanImage, setScanImage] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [showCreatePolicy, setShowCreatePolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ name: '', description: '', readonlyRootFilesystem: false, noNewPrivileges: true, runAsNonRoot: false });

  // Secret dialog state
  const [showCreateSecret, setShowCreateSecret] = useState(false);
  const [secretForm, setSecretForm] = useState({ name: '', value: '' });

  // Config dialog state
  const [showCreateConfig, setShowCreateConfig] = useState(false);
  const [configForm, setConfigForm] = useState({ name: '', value: '' });

  const { data: policies = [], isLoading: loadingPolicies } = useQuery({
    throwOnError: false,
    queryKey: ['security-policies'],
    queryFn: async () => {
      const res = await api.get('/security/policies');
      return res.data?.data ?? res.data;
    },
  });

  const { data: trivyStatus = [] } = useQuery({
    throwOnError: false,
    queryKey: ['trivy-status'],
    queryFn: async () => {
      const res = await api.get('/security/trivy/status');
      return res.data?.data ?? res.data;
    },
  });

  const { data: secrets = [], isLoading: loadingSecrets } = useQuery({
    throwOnError: false,
    queryKey: ['docker-secrets', endpointId],
    queryFn: async () => {
      const res = await api.get('/security/secrets', { params: { endpointId } });
      return res.data?.data ?? res.data;
    },
  });

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    throwOnError: false,
    queryKey: ['docker-configs', endpointId],
    queryFn: async () => {
      const res = await api.get('/security/configs', { params: { endpointId } });
      return res.data?.data ?? res.data;
    },
  });

  const scanMutation = useMutation({
    mutationFn: (image: string) => api.post('/security/scan', { image }),
    onSuccess: (res) => { setScanResult(res.data); },
    onError: (e: any) => toast({ title: 'Scan failed', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const createPolicyMutation = useMutation({
    mutationFn: (dto: any) => api.post('/security/policies', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      setShowCreatePolicy(false);
      toast({ title: 'Policy created' });
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/security/policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policies'] });
      toast({ title: 'Policy deleted' });
    },
  });

  const createSecretMutation = useMutation({
    mutationFn: (data: { name: string; value: string }) =>
      api.post('/security/secrets', data, { params: { endpointId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-secrets'] });
      setShowCreateSecret(false);
      setSecretForm({ name: '', value: '' });
      toast({ title: 'Secret created' });
    },
    onError: (e: any) => toast({ title: 'Failed to create secret', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const deleteSecretMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/security/secrets/${id}`, { params: { endpointId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-secrets'] });
      toast({ title: 'Secret deleted' });
    },
    onError: (e: any) => toast({ title: 'Failed to delete secret', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const createConfigMutation = useMutation({
    mutationFn: (data: { name: string; value: string }) =>
      api.post('/security/configs', data, { params: { endpointId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-configs'] });
      setShowCreateConfig(false);
      setConfigForm({ name: '', value: '' });
      toast({ title: 'Config created' });
    },
    onError: (e: any) => toast({ title: 'Failed to create config', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/security/configs/${id}`, { params: { endpointId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docker-configs'] });
      toast({ title: 'Config deleted' });
    },
    onError: (e: any) => toast({ title: 'Failed to delete config', description: e.response?.data?.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground">Security policies, image scanning, secrets and configs</p>
      </div>

      <Tabs defaultValue="scan">
        <TabsList>
          <TabsTrigger value="scan">Image Scan</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="configs">Configs</TabsTrigger>
        </TabsList>

        {/* Image Scanning */}
        <TabsContent value="scan" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="w-5 h-5" />
                Image Vulnerability Scan
              </CardTitle>
              <CardDescription>
                {trivyStatus?.available
                  ? 'Trivy is available. Scan Docker images for vulnerabilities.'
                  : 'Trivy is not installed. Install trivy CLI to enable scanning.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. nginx:latest"
                  value={scanImage}
                  onChange={(e) => setScanImage(e.target.value)}
                  className="max-w-md"
                />
                <Button
                  onClick={() => { setScanResult(null); scanMutation.mutate(scanImage); }}
                  disabled={!scanImage || scanMutation.isPending}
                >
                  <Search className="w-4 h-4 mr-2" />
                  {scanMutation.isPending ? 'Scanning...' : 'Scan'}
                </Button>
              </div>

              {scanResult && (
                <div className="space-y-3">
                  {scanResult.error ? (
                    <div className="p-4 bg-red-50 rounded border border-red-200 text-red-700">{scanResult.error}</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-5 gap-3">
                        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].map((sev) => (
                          <Card key={sev}>
                            <CardContent className="pt-4 pb-3 text-center">
                              <p className="text-2xl font-bold">{scanResult.summary?.[sev.toLowerCase()] || 0}</p>
                              <p className="text-xs text-muted-foreground">{sev}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                      {scanResult.vulnerabilities?.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>CVE ID</TableHead>
                              <TableHead>Severity</TableHead>
                              <TableHead>Package</TableHead>
                              <TableHead>Version</TableHead>
                              <TableHead>Fixed In</TableHead>
                              <TableHead>Title</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {scanResult.vulnerabilities.slice(0, 50).map((v: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{v.id}</TableCell>
                                <TableCell><Badge variant={severityVariant[v.severity] || 'outline'}>{v.severity}</Badge></TableCell>
                                <TableCell>{v.pkg}</TableCell>
                                <TableCell className="font-mono text-xs">{v.version}</TableCell>
                                <TableCell className="font-mono text-xs text-green-600">{v.fixedVersion || '—'}</TableCell>
                                <TableCell className="text-sm max-w-xs truncate">{v.title}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Policies */}
        <TabsContent value="policies" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreatePolicy(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Policy
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Read-only FS</TableHead>
                    <TableHead>No New Privs</TableHead>
                    <TableHead>Non-root</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPolicies ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : (policies as any[])?.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No policies defined</TableCell></TableRow>
                  ) : (
                    (policies as any[])?.map((p: any) => (
                      <TableRow key={p._id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.readonlyRootFilesystem ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}</TableCell>
                        <TableCell>{p.noNewPrivileges ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}</TableCell>
                        <TableCell>{p.runAsNonRoot ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}</TableCell>
                        <TableCell><Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deletePolicyMutation.mutate(p._id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Secrets */}
        <TabsContent value="secrets" className="space-y-4">
          <div className="flex justify-between items-center">
            <div />
            <Button onClick={() => setShowCreateSecret(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Secret
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                Docker Secrets
              </CardTitle>
              <CardDescription>Manage Docker Swarm secrets</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSecrets ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : (secrets as any[])?.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No secrets found (requires Swarm mode)</TableCell></TableRow>
                  ) : (
                    (secrets as any[])?.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.id?.substring(0, 12)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteSecretMutation.mutate(s.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configs */}
        <TabsContent value="configs" className="space-y-4">
          <div className="flex justify-between items-center">
            <div />
            <Button onClick={() => setShowCreateConfig(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Config
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Docker Configs
              </CardTitle>
              <CardDescription>Manage Docker Swarm configs</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingConfigs ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : (configs as any[])?.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No configs found (requires Swarm mode)</TableCell></TableRow>
                  ) : (
                    (configs as any[])?.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.id?.substring(0, 12)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => deleteConfigMutation.mutate(c.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Policy Dialog */}
      <Dialog open={showCreatePolicy} onOpenChange={setShowCreatePolicy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Security Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Policy Name</Label>
              <Input
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder="production-strict"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={policyForm.description}
                onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              {[
                { key: 'readonlyRootFilesystem', label: 'Read-only root filesystem' },
                { key: 'noNewPrivileges', label: 'No new privileges' },
                { key: 'runAsNonRoot', label: 'Run as non-root user' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <input
                    type="checkbox"
                    checked={(policyForm as any)[key]}
                    onChange={(e) => setPolicyForm({ ...policyForm, [key]: e.target.checked })}
                    className="w-4 h-4"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreatePolicy(false)}>Cancel</Button>
            <Button
              onClick={() => createPolicyMutation.mutate(policyForm)}
              disabled={!policyForm.name || createPolicyMutation.isPending}
            >
              Create Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Secret Dialog */}
      <Dialog open={showCreateSecret} onOpenChange={setShowCreateSecret}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Docker Secret</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Secret Name</Label>
              <Input
                value={secretForm.name}
                onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })}
                placeholder="my-secret"
              />
            </div>
            <div className="space-y-2">
              <Label>Secret Value</Label>
              <textarea
                className="w-full h-32 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={secretForm.value}
                onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })}
                placeholder="Enter secret value..."
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateSecret(false)}>Cancel</Button>
            <Button
              onClick={() => createSecretMutation.mutate(secretForm)}
              disabled={!secretForm.name || !secretForm.value || createSecretMutation.isPending}
            >
              {createSecretMutation.isPending ? 'Creating...' : 'Create Secret'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Config Dialog */}
      <Dialog open={showCreateConfig} onOpenChange={setShowCreateConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Docker Config</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Config Name</Label>
              <Input
                value={configForm.name}
                onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                placeholder="my-config"
              />
            </div>
            <div className="space-y-2">
              <Label>Config Data</Label>
              <textarea
                className="w-full h-32 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={configForm.value}
                onChange={(e) => setConfigForm({ ...configForm, value: e.target.value })}
                placeholder="Enter config data..."
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateConfig(false)}>Cancel</Button>
            <Button
              onClick={() => createConfigMutation.mutate(configForm)}
              disabled={!configForm.name || !configForm.value || createConfigMutation.isPending}
            >
              {createConfigMutation.isPending ? 'Creating...' : 'Create Config'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

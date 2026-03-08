import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Trash2, RefreshCw, HardDrive, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatDate, formatBytes } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

const statusIcon: Record<string, JSX.Element> = {
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  pending: <Clock className="w-4 h-4 text-yellow-500" />,
};

const statusVariant: Record<string, any> = {
  success: 'success',
  failed: 'destructive',
  running: 'default',
  pending: 'warning',
};

export function BackupPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', includeDatabase: true, includeConfigs: true });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const res = await api.get('/backup');
      const result = res.data?.data ?? res.data;
      return Array.isArray(result) ? result : (result?.data ?? result ?? []);
    },
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (dto: any) => api.post('/backup', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setShowCreate(false);
      toast({ title: 'Backup started' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/backup/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast({ title: 'Backup deleted' });
    },
  });

  const handleDownload = async (jobId: string) => {
    const stored = localStorage.getItem("swarmui-auth");
    const token = stored ? JSON.parse(stored).token : "";
    const res = await fetch(`/api/v1/backup/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { alert("Download failed"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `backup-${jobId}.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  const jobs = data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Backup</h1>
          <p className="text-muted-foreground">Manage system backups and restore points</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Backup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{jobs.filter((j: any) => j.status === 'success').length}</p>
                <p className="text-sm text-muted-foreground">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><XCircle className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{jobs.filter((j: any) => j.status === 'failed').length}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><HardDrive className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">
                  {formatBytes(jobs.reduce((acc: number, j: any) => acc + (j.fileSize || 0), 0))}
                </p>
                <p className="text-sm text-muted-foreground">Total size</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
          <CardDescription>All backup jobs and their status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : jobs.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No backups yet. Create your first backup.</TableCell></TableRow>
              ) : (
                jobs.map((job: any) => (
                  <TableRow key={job._id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcon[job.status]}
                        <Badge variant={statusVariant[job.status]}>{job.status}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{job.fileSize ? formatBytes(job.fileSize) : '—'}</TableCell>
                    <TableCell><Badge variant="outline">{job.storage}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.completedAt ? formatDate(job.completedAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {job.status === 'success' && job.storage === 'local' && (
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => handleDownload(job._id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => deleteMutation.mutate(job._id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Backup Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="my-backup-2026-03-01"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Include Database</Label>
              <Switch
                checked={form.includeDatabase}
                onCheckedChange={(v) => setForm({ ...form, includeDatabase: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Include Configs</Label>
              <Switch
                checked={form.includeConfigs}
                onCheckedChange={(v) => setForm({ ...form, includeConfigs: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || createMutation.isPending}
            >
              {createMutation.isPending ? 'Starting...' : 'Start Backup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

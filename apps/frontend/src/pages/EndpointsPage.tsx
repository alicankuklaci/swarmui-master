import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, Server, CheckCircle, XCircle, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

export function EndpointsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['endpoints', search],
    queryFn: async () => {
      const res = await api.get('/endpoints', { params: { search, limit: 50 } });
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/endpoints', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setCreateOpen(false);
      toast({ title: 'Endpoint added' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/endpoints/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      toast({ title: 'Endpoint deleted' });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/endpoints/${id}/test`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      const data = res.data.data;
      toast({ title: data.success ? 'Connection successful' : 'Connection failed', description: data.error || `Docker ${data.dockerVersion}` });
    },
  });

  const { register, handleSubmit, control, reset } = useForm({
    defaultValues: { name: '', type: 'local', url: 'unix:///var/run/docker.sock' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Endpoints</h1>
          <p className="text-muted-foreground">Manage Docker endpoints and connections</p>
        </div>
        <Button onClick={() => { reset(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Endpoint
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search endpoints..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Docker</TableHead>
                <TableHead>Swarm</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No endpoints configured</TableCell></TableRow>
              ) : (
                data?.data?.map((endpoint: any) => (
                  <TableRow key={endpoint._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{endpoint.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">{endpoint.url}</TableCell>
                    <TableCell><Badge variant="outline">{endpoint.type}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {endpoint.status === 'active' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        <Badge variant={endpoint.status === 'active' ? 'success' : 'destructive'}>{endpoint.status}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{endpoint.dockerVersion || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={endpoint.swarmEnabled ? 'success' : 'secondary'}>
                        {endpoint.swarmEnabled ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => testMutation.mutate(endpoint._id)} disabled={testMutation.isPending}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(endpoint._id)}>
                          <Trash2 className="w-4 h-4" />
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Endpoint</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...register('name', { required: true })} placeholder="local" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local Socket</SelectItem>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input {...register('url', { required: true })} placeholder="unix:///var/run/docker.sock" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>Add Endpoint</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

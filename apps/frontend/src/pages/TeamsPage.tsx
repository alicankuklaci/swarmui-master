import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

export function TeamsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['teams', search],
    queryFn: async () => {
      const res = await api.get('/teams', { params: { search, limit: 50 } });
      return res.data?.data?.data ?? res.data?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/teams', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setCreateOpen(false);
      toast({ title: 'Team created' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast({ title: 'Team deleted' });
    },
  });

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: '', description: '' },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-muted-foreground">Manage teams and their members</p>
        </div>
        <Button onClick={() => { reset(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Create Team
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search teams..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No teams found</TableCell></TableRow>
              ) : (
                data?.data?.map((team: any) => (
                  <TableRow key={team._id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell className="text-muted-foreground">{team.description || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Users className="w-3 h-3 mr-1" />{team.members?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(team.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(team._id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
          <DialogHeader><DialogTitle>Create Team</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...register('name', { required: true })} placeholder="Development Team" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input {...register('description')} placeholder="Optional description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

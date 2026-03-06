import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Shield, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

const RESOURCES = ['containers', 'services', 'images', 'volumes', 'networks', 'stacks', 'nodes'];
const ACTIONS = ['read', 'create', 'update', 'delete', 'exec', 'logs', 'pull', 'restart'];

export function RolesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get('/roles');
      return res.data?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (dto: any) => api.post('/roles', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setCreateOpen(false);
      resetForm();
      toast({ title: 'Role created' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Failed to create role' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({ title: 'Role deleted' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Cannot delete this role' });
    },
  });

  function resetForm() {
    setRoleName('');
    setRoleDescription('');
    setPermissions({});
  }

  function togglePermission(resource: string, action: string) {
    setPermissions((prev) => {
      const current = prev[resource] || [];
      const has = current.includes(action);
      return {
        ...prev,
        [resource]: has ? current.filter((a) => a !== action) : [...current, action],
      };
    });
  }

  function handleCreate() {
    const perms = Object.entries(permissions)
      .filter(([, actions]) => actions.length > 0)
      .map(([resource, actions]) => ({ resource, actions }));
    createMutation.mutate({ name: roleName, description: roleDescription, permissions: perms });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roles</h1>
          <p className="text-muted-foreground">Manage role-based access control</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Create Role
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : (
                data?.map((role: any) => (
                  <>
                    <TableRow key={role._id} className="cursor-pointer" onClick={() => setExpandedRole(expandedRole === role._id ? null : role._id)}>
                      <TableCell>
                        {expandedRole === role._id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {role.isBuiltin ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Shield className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-medium">{role.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{role.description}</TableCell>
                      <TableCell>
                        <Badge variant={role.isBuiltin ? 'secondary' : 'outline'}>
                          {role.isBuiltin ? 'Built-in' : 'Custom'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{role.permissions?.length || 0} rules</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(role.createdAt)}</TableCell>
                      <TableCell>
                        {!role.isBuiltin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(role._id); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedRole === role._id && (
                      <TableRow key={`${role._id}-perms`}>
                        <TableCell colSpan={7} className="bg-muted/30 px-8 py-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium mb-2">Permissions:</p>
                            {role.permissions?.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No permissions defined</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {role.permissions?.map((p: any, i: number) => (
                                  <div key={i} className="flex items-center gap-1">
                                    <Badge variant="outline" className="font-mono text-xs">
                                      {p.resource}: {p.actions?.join(', ')}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. devops-lead" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Resource</th>
                      {ACTIONS.map((a) => (
                        <th key={a} className="text-center px-2 py-2 font-medium text-xs">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map((res) => (
                      <tr key={res} className="border-t">
                        <td className="px-3 py-2 font-medium">{res}</td>
                        {ACTIONS.map((action) => (
                          <td key={action} className="text-center px-2 py-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                              checked={permissions[res]?.includes(action) || false}
                              onChange={() => togglePermission(res, action)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!roleName || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

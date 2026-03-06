import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Search, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { formatDate } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

const roleColors: Record<string, 'default' | 'secondary' | 'destructive' | 'warning'> = {
  admin: 'destructive',
  operator: 'default',
  helpdesk: 'secondary',
  standard: 'secondary',
  readonly: 'secondary',
};

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      const res = await api.get('/users', { params: { search, limit: 50 } });
      return res.data?.data?.data ?? res.data?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      toast({ title: 'User created', description: 'New user has been created successfully' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Failed to create user' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditOpen(false);
      toast({ title: 'User updated' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Failed to update user' });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setPasswordOpen(false);
      setNewPassword('');
      toast({ title: 'Password reset', description: 'User password has been changed' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Failed to reset password' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User deleted', description: 'User has been removed' });
    },
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    defaultValues: { username: '', email: '', password: '', role: 'standard' },
  });

  const onSubmit = (data: any) => createMutation.mutate(data);

  function openEdit(user: any) {
    setEditUser({ ...user });
    setEditOpen(true);
  }

  function openPasswordReset(userId: string) {
    setPasswordUserId(userId);
    setNewPassword('');
    setPasswordOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Button onClick={() => { reset(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">{data?.length || 0} users</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : !data?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No users found</TableCell>
                </TableRow>
              ) : (
                data?.map((user: any) => (
                  <TableRow key={user._id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role] || 'secondary'}>{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'destructive'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.authProvider}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{user.createdAt ? formatDate(user.createdAt) : "—"}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit user">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openPasswordReset(user._id)} title="Reset password">
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(user._id)}
                        title="Delete user"
                      >
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

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input {...register('username', { required: 'Username is required' })} placeholder="john.doe" />
              {errors.username && <p className="text-red-500 text-sm">{errors.username.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register('email', { required: 'Email is required' })} placeholder="john@example.com" type="email" />
              {errors.email && <p className="text-red-500 text-sm">{errors.email.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Min 8 characters' } })} type="password" placeholder="••••••••" />
              {errors.password && <p className="text-red-500 text-sm">{errors.password.message as string}</p>}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="helpdesk">Helpdesk</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="readonly">Read Only</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.username}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={editUser.email || ''}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="helpdesk">Helpdesk</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="readonly">Read Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => updateMutation.mutate({ id: editUser._id, data: { email: editUser.email, role: editUser.role } })}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button
              onClick={() => resetPasswordMutation.mutate({ id: passwordUserId, password: newPassword })}
              disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

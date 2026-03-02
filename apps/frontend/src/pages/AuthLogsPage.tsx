import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/utils';

const eventVariant: Record<string, any> = {
  login_success: 'success',
  login_fail: 'destructive',
  logout: 'secondary',
  token_refresh: 'default',
  mfa_success: 'success',
  mfa_fail: 'destructive',
  password_change: 'warning',
};

export function AuthLogsPage() {
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['auth-logs', search, eventFilter],
    queryFn: async () => {
      const res = await api.get('/logs/auth', {
        params: { limit: 100, username: search || undefined, event: eventFilter || undefined },
      });
      return res.data?.data ?? res.data;
    },
  });

  const handleExport = () => {
    const params = new URLSearchParams({ export: 'csv', limit: '10000' });
    if (search) params.set('username', search);
    if (eventFilter) params.set('event', eventFilter);
    window.open(`/api/v1/logs/auth?${params.toString()}`, '_blank');
  };

  const logs = data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auth Logs</h1>
          <p className="text-muted-foreground">Authentication and login event history</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by username..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All events</SelectItem>
                <SelectItem value="login_success">Login Success</SelectItem>
                <SelectItem value="login_fail">Login Failed</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="mfa_success">MFA Success</SelectItem>
                <SelectItem value="mfa_fail">MFA Failed</SelectItem>
                <SelectItem value="password_change">Password Change</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No auth logs found</TableCell></TableRow>
              ) : (
                logs.map((log: any) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                    <TableCell className="font-medium">{log.username || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant={eventVariant[log.event] || 'secondary'}>{log.event?.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      {log.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{log.ip || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.details || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';

const methodColors: Record<string, 'default' | 'secondary' | 'destructive' | 'warning'> = {
  GET: 'secondary',
  POST: 'default',
  PUT: 'warning',
  PATCH: 'warning',
  DELETE: 'destructive',
};

export function ActivityLogsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs', search],
    queryFn: async () => {
      const res = await api.get('/activity-logs', { params: { limit: 100, action: search } });
      return res.data.data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">Audit trail of all user actions</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Filter by action..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data?.data?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
              ) : (
                data?.data?.map((log: any) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                    <TableCell className="font-medium">{log.username || 'Anonymous'}</TableCell>
                    <TableCell>
                      <Badge variant={methodColors[log.method] || 'secondary'}>{log.method}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.path}</TableCell>
                    <TableCell>
                      <Badge variant={log.statusCode < 400 ? 'success' : 'destructive'}>{log.statusCode}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{log.ip}</TableCell>
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

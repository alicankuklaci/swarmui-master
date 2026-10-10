import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';
import { CreateApiKeyDialog, type ApiKeyScope } from './CreateApiKeyDialog';
import { SearchInput } from '@/components/ui/search-input';
import { useUrlSearch } from '@/hooks/useUrlSearch';

interface ApiKeyItem {
  _id: string;
  name: string;
  keyPrefix: string;
  scope: ApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  active: boolean;
  createdAt: string;
}

const scopeColors: Record<ApiKeyScope, string> = {
  read: 'default',
  write: 'warning',
  admin: 'destructive',
};

/**
 * CRUD half of the API Keys page. Create flow is delegated to
 * `CreateApiKeyDialog` so this stays under 300 LOC.
 */
export function ApiKeysList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading } = useQuery<ApiKeyItem[]>({
    queryKey: ['api-keys'],
    queryFn: () =>
      api
        .get('/api-keys')
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.data ?? []))),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key revoked' });
    },
    onError: () => toast({ title: 'Failed to revoke API key', variant: 'destructive' }),
  });

  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();
  const filteredKeys = needle
    ? keys.filter((k) =>
        (k.name || '').toLowerCase().includes(needle) ||
        (k.keyPrefix || '').toLowerCase().includes(needle) ||
        (k.scope || []).join(' ').toLowerCase().includes(needle),
      )
    : keys;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search API keys by name, prefix, or scope" />
        <CreateApiKeyDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            {filteredKeys.length} of {keys.length} key{keys.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
          ) : filteredKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              {needle ? `No API keys match "${debounced}".` : 'No API keys yet. Create one to get started.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys.map((k) => (
                  <TableRow key={k._id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        sk-{k.keyPrefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {k.scope.map((s) => (
                          <Badge
                            key={s}
                            variant={scopeColors[s] as any}
                            className="text-xs capitalize"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(k.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.expiresAt ? formatDate(k.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.active ? 'success' : 'secondary'}>
                        {k.active ? 'Active' : 'Revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {k.active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeMutation.mutate(k._id)}
                          disabled={revokeMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

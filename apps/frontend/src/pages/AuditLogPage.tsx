import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/stores/app.store';
import { format } from 'date-fns';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
  PUT: 'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
};

export default function AuditLogPage() {
  const { selectedEndpointId } = useAppStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search, filterUser],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('action', search);
      if (filterUser) params.set('userId', filterUser);
      const res = await api.get(`/logs/activity?${params}`);
      return res.data;
    },
    refetchInterval: 30000,
  });

  const logs = data?.data?.data ?? data?.data ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  const exportCSV = async () => {
    const params = new URLSearchParams({ export: 'csv', limit: '10000' });
    if (search) params.set('action', search);
    const res = await api.get(`/logs/activity?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Son 90 günün API aktivite kaydı — {total} kayıt</p>
        </div>
        <button onClick={exportCSV} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-secondary/80 flex items-center gap-2">
          ⬇ CSV İndir
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Aksiyon ara... (örn: POST, /login, /services)"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
        />
        <button onClick={() => { setSearch(''); setFilterUser(''); setPage(1); }}
          className="px-3 py-2 text-sm border rounded-md hover:bg-accent">
          Temizle
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Zaman</th>
              <th className="px-4 py-3 text-left font-medium">Kullanıcı</th>
              <th className="px-4 py-3 text-left font-medium">Metod</th>
              <th className="px-4 py-3 text-left font-medium">Aksiyon / Path</th>
              <th className="px-4 py-3 text-left font-medium">Durum</th>
              <th className="px-4 py-3 text-left font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Yükleniyor...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Kayıt bulunamadı</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log._id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                  {log.createdAt ? format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm:ss') : '-'}
                </td>
                <td className="px-4 py-3 font-medium">{log.username || <span className="text-muted-foreground">anonim</span>}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${METHOD_COLORS[log.method] || 'bg-muted text-foreground'}`}>
                    {log.method}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs max-w-xs truncate" title={log.path}>{log.path}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    log.statusCode >= 500 ? 'bg-red-100 text-red-700' :
                    log.statusCode >= 400 ? 'bg-orange-100 text-orange-700' :
                    log.statusCode >= 200 ? 'bg-green-100 text-green-700' :
                    'bg-muted text-muted-foreground'
                  }`}>{log.statusCode || '-'}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                  {log.ip?.replace('::ffff:', '') || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sayfa {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 border rounded hover:bg-accent disabled:opacity-50">← Önceki</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 border rounded hover:bg-accent disabled:opacity-50">Sonraki →</button>
          </div>
        </div>
      )}
    </div>
  );
}

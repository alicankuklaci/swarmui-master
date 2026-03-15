import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAppStore } from '@/stores/app.store';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function AppShell() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const selectedEndpointId = useAppStore((s) => s.selectedEndpointId);
  const setSelectedEndpoint = useAppStore((s) => s.setSelectedEndpoint);

  const { data: endpoints } = useQuery({
    queryKey: ['endpoints-auto'],
    queryFn: () => api.get('/endpoints', { params: { limit: 1 } }).then((r) => Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : r.data?.data ?? r.data),
  });

  useEffect(() => {
    if (!selectedEndpointId && Array.isArray(endpoints) && endpoints.length > 0) {
      const ep = endpoints[0];
      const id = ep.id ?? ep._id ?? ep.ID ?? String(ep);
      if (id) setSelectedEndpoint(id);
    }
  }, [endpoints, selectedEndpointId, setSelectedEndpoint]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className={cn('flex flex-col flex-1 overflow-hidden transition-all duration-300', sidebarOpen ? 'ml-64' : 'ml-16')}>
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
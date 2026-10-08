import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAppStore } from '@/stores/app.store';
import { cn } from '@/lib/utils';

export function AppShell() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

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

import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UsersRound, Shield, Server, Settings,
  Activity, ChevronLeft, ChevronRight, Container, Network,
  HardDrive, Image, Layers, GitBranch, Grid3X3,
  LayoutGrid, Package, GitMerge, HardDriveDownload, Lock, KeyRound, Bell,
  Radio, Sliders, Send, Zap,
 ClipboardList,} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';
import { useAppStore } from '@/stores/app.store';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

const navSections = [
  {
    titleKey: null as string | null,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
      { to: '/endpoints', icon: Server, labelKey: 'nav.endpoints' },
    ],
  },
  {
    titleKey: 'nav.docker',
    items: [
      { to: '/containers', icon: Container, labelKey: 'nav.containers' },
      { to: '/images', icon: Image, labelKey: 'nav.images' },
      { to: '/networks', icon: Network, labelKey: 'nav.networks' },
      { to: '/volumes', icon: HardDrive, labelKey: 'nav.volumes' },
      { to: '/events', icon: Radio, labelKey: 'nav.events' },
    ],
  },
  {
    titleKey: 'nav.swarm',
    items: [
      { to: '/swarm', icon: Grid3X3, labelKey: 'nav.swarm' },
      { to: '/nodes', icon: Server, labelKey: 'nav.nodes' },
      { to: '/visualizer', icon: LayoutDashboard, labelKey: 'nav.clusterVisualizer' },
      { to: '/audit-log', icon: ClipboardList, labelKey: 'nav.auditLog' },
      { to: '/services', icon: Layers, labelKey: 'nav.services' },
      { to: '/stacks', icon: GitBranch, labelKey: 'nav.stacks' },
    ],
  },
  {
    titleKey: 'nav.platform',
    items: [
      { to: '/registries', icon: Package, labelKey: 'nav.registries' },
      { to: '/templates', icon: LayoutGrid, labelKey: 'nav.templates' },
      { to: '/gitops', icon: GitMerge, labelKey: 'nav.gitops' },
    ],
  },
  {
    titleKey: 'nav.observability',
    items: [
      { to: '/monitoring', icon: Activity, labelKey: 'nav.monitoring', defaultLabel: 'Monitoring' },
      { to: '/monitoring/live', icon: Zap, labelKey: 'nav.liveMonitoring', defaultLabel: 'Live view' },
      { to: '/monitoring/uptime', icon: Radio, labelKey: 'nav.uptime', defaultLabel: 'Uptime' },
      { to: '/monitoring/alarms', icon: Bell, labelKey: 'nav.alarms', defaultLabel: 'Alarms', firingBadge: true },
      { to: '/monitoring/rules', icon: Sliders, labelKey: 'nav.alarmRules', defaultLabel: 'Alarm Rules' },
    ],
  },
  {
    titleKey: 'nav.enterprise',
    items: [
      { to: '/backup', icon: HardDriveDownload, labelKey: 'nav.backup' },
      { to: '/security', icon: Lock, labelKey: 'nav.security' },
      { to: '/api-keys', icon: KeyRound, labelKey: 'nav.apiKeys' },
      { to: '/notifications', icon: Bell, labelKey: 'nav.notifications' },
      { to: '/notifications/channels', icon: Send, labelKey: 'nav.notificationChannels', defaultLabel: 'Notification Channels' },
    ],
  },
  {
    titleKey: 'nav.admin',
    items: [
      { to: '/users', icon: Users, labelKey: 'nav.users' },
      { to: '/teams', icon: UsersRound, labelKey: 'nav.teams' },
      { to: '/roles', icon: Shield, labelKey: 'nav.roles' },
      { to: '/activity-logs', icon: Activity, labelKey: 'nav.activityLogs' },
      { to: '/auth-logs', icon: KeyRound, labelKey: 'nav.authLogs' },
      { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
    ],
  },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const user = useAuthStore((s) => s.user) as any;
  // Prefer permission-based gate when the backend ships them; fall back to role.
  const hasAdminPermission = Array.isArray(user?.permissions)
    && (user.permissions.includes('admin:*') || user.permissions.includes('admin'));
  const isAdmin = hasAdminPermission || user?.role === 'admin';
  const { t } = useTranslation();

  // Firing-alarm badge for the Alarms nav item. Only queries when the user
  // has access to monitoring endpoints (admin/operator) to avoid 403 noise.
  const canSeeMonitoring = isAdmin || user?.role === 'operator';
  const firingQuery = useQuery({
    queryKey: ['monitoring', 'firing-count-sidebar'],
    queryFn: () => api.get('/monitoring/alarms/firing-count').then((r) => unwrap<{ count: number }>(r)),
    refetchInterval: 30_000,
    retry: false,
    enabled: canSeeMonitoring,
  });
  const firingCount = firingQuery.data?.count ?? 0;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-gray-900 text-white transition-all duration-300 z-30 flex flex-col',
        sidebarOpen ? 'w-64' : 'w-16',
      )}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Container className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg">SwarmUI Master</span>
          </div>
        )}
        {!sidebarOpen && (
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center mx-auto">
            <Container className="w-5 h-5" />
          </div>
        )}
        {sidebarOpen && (
          <button
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            className="p-1 rounded hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {navSections.filter((section) => {
          if (section.titleKey === 'nav.admin') return isAdmin;
          if (section.titleKey === 'nav.observability') return canSeeMonitoring;
          return true;
        }).map((section, si) => (
          <div key={si} className="mb-1">
            {section.titleKey && sidebarOpen && (
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t(section.titleKey)}
              </div>
            )}
            {section.titleKey && !sidebarOpen && (
              <div className="my-1 mx-3 border-t border-gray-700" />
            )}
            {section.items.map((item: any) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/monitoring'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-2.5 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors',
                    isActive && 'bg-gray-700 text-white border-r-2 border-blue-500',
                    !sidebarOpen && 'justify-center',
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="text-sm font-medium flex-1 flex items-center justify-between">
                    <span>{String(t(item.labelKey, { defaultValue: item.defaultLabel || item.labelKey }))}</span>
                    {item.firingBadge && firingCount > 0 && (
                      <span className="ml-2 bg-red-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums">
                        {firingCount}
                      </span>
                    )}
                  </span>
                )}
                {!sidebarOpen && item.firingBadge && firingCount > 0 && (
                  <span className="absolute right-2 top-2 bg-red-500 text-white text-[9px] rounded-full px-1 tabular-nums">
                    {firingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Version bilgisi */}
      {sidebarOpen && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-700">
          <p className="text-xs text-gray-500 font-mono">
            v{import.meta.env.VITE_BUILD_VERSION ?? 'dev'}
          </p>
          <p className="text-xs text-gray-600 font-mono">
            {import.meta.env.VITE_BUILD_TIME ?? ''}
          </p>
        </div>
      )}

      {!sidebarOpen && (
        <div className="pb-4 flex justify-center">
          <button
            onClick={toggleSidebar}
            aria-label="Expand sidebar"
            className="p-2 rounded hover:bg-gray-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

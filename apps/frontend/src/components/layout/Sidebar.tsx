import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, UsersRound, Shield, Server, Settings,
  Activity, ChevronLeft, ChevronRight, Container, Network,
  HardDrive, Image, Layers, GitBranch, Grid3X3,
  LayoutGrid, Package, GitMerge, HardDriveDownload, Lock, KeyRound, Bell,
  Radio,
} from 'lucide-react';
import { useAppStore } from '@/stores/app.store';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

const navSections = [
  {
    title: null as string | null,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/endpoints', icon: Server, label: 'Endpoints' },
    ],
  },
  {
    title: 'Docker',
    items: [
      { to: '/containers', icon: Container, label: 'Containers' },
      { to: '/images', icon: Image, label: 'Images' },
      { to: '/networks', icon: Network, label: 'Networks' },
      { to: '/volumes', icon: HardDrive, label: 'Volumes' },
      { to: '/events', icon: Radio, label: 'Events' },
    ],
  },
  {
    title: 'Swarm',
    items: [
      { to: '/swarm', icon: Grid3X3, label: 'Swarm' },
      { to: '/nodes', icon: Server, label: 'Nodes' },
      { to: '/visualizer', icon: LayoutDashboard, label: 'Cluster Visualizer' },
      { to: '/services', icon: Layers, label: 'Services' },
      { to: '/stacks', icon: GitBranch, label: 'Stacks' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/registries', icon: Package, label: 'Registries' },
      { to: '/templates', icon: LayoutGrid, label: 'Templates' },
      { to: '/gitops', icon: GitMerge, label: 'GitOps' },
    ],
  },
  {
    title: 'Enterprise',
    items: [
      { to: '/backup', icon: HardDriveDownload, label: 'Backup' },
      { to: '/security', icon: Lock, label: 'Security' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/users', icon: Users, label: 'Users' },
      { to: '/teams', icon: UsersRound, label: 'Teams' },
      { to: '/roles', icon: Shield, label: 'Roles' },
      { to: '/activity-logs', icon: Activity, label: 'Activity Logs' },
      { to: '/auth-logs', icon: KeyRound, label: 'Auth Logs' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useAppStore();
  const userRole = useAuthStore((s) => s.user?.role);
  const isAdmin = userRole === 'admin';

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
          <button onClick={toggleSidebar} className="p-1 rounded hover:bg-gray-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {navSections.filter((section) => section.title !== 'Admin' || isAdmin).map((section, si) => (
          <div key={si} className="mb-1">
            {section.title && sidebarOpen && (
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {section.title && !sidebarOpen && (
              <div className="my-1 mx-3 border-t border-gray-700" />
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-2.5 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors',
                    isActive && 'bg-gray-700 text-white border-r-2 border-blue-500',
                    !sidebarOpen && 'justify-center',
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {!sidebarOpen && (
        <div className="pb-4 flex justify-center">
          <button onClick={toggleSidebar} className="p-2 rounded hover:bg-gray-700 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

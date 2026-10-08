import { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, CheckCheck, Info, AlertTriangle, XCircle, CheckCircle, Globe, Server, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { useAppStore } from '@/stores/app.store';
import { useLogout } from '@/hooks/useAuth';
import { useEndpointsList } from '@/hooks/useDocker';
import { useAppMutation } from '@/hooks/useAppMutation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatDate } from '@/lib/utils';

const langs = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'tr', label: '🇹🇷 Türkçe' },
  { code: 'de', label: '🇩🇪 Deutsch' },
  { code: 'fr', label: '🇫🇷 Français' },
];

const levelIcon: Record<string, JSX.Element> = {
  info: <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />,
  error: <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />,
  success: <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />,
};

export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [bellOpen, setBellOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [endpointOpen, setEndpointOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const endpointRef = useRef<HTMLDivElement>(null);

  const selectedEndpointId = useAppStore((s) => s.selectedEndpointId);
  const setSelectedEndpoint = useAppStore((s) => s.setSelectedEndpoint);
  const { data: endpoints = [] } = useEndpointsList();
  const currentEndpoint = (endpoints as any[]).find(
    (e) => (e._id ?? e.id) === selectedEndpointId,
  );

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return res.data.data;
    },
    refetchInterval: 30000,
    retry: false,
  });

  const { data: notifData } = useQuery({
    queryKey: ['notifications-preview'],
    queryFn: async () => {
      const res = await api.get('/notifications', { params: { limit: 8 } });
      return res.data.data;
    },
    enabled: bellOpen,
    retry: false,
  });

  const markAllMutation = useAppMutation(
    () => api.patch('/notifications/mark-all-read').then((r) => r.data?.data ?? r.data),
    {
      invalidate: [
        ['notifications-unread'],
        ['notifications-preview'],
        ['notifications'],
      ],
    },
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
      if (endpointRef.current && !endpointRef.current.contains(e.target as Node)) {
        setEndpointOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = unreadData?.count || 0;
  const notifications = notifData?.data || [];

  const roleColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
    admin: 'destructive',
    operator: 'default',
    helpdesk: 'secondary',
    standard: 'secondary',
    readonly: 'secondary',
  };

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">SwarmUI Master</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Endpoint switcher */}
        <div className="relative" ref={endpointRef}>
          <Button
            variant="outline"
            size="sm"
            aria-label="Switch active endpoint"
            aria-haspopup="menu"
            aria-expanded={endpointOpen}
            onClick={() => setEndpointOpen((o) => !o)}
            className="h-8 gap-1.5 font-normal max-w-[220px]"
          >
            <Server className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-xs">
              {currentEndpoint?.name ?? (endpoints.length === 0 ? 'No endpoint' : 'Select endpoint')}
            </span>
            <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          </Button>
          {endpointOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 w-64 bg-background border rounded-lg shadow-lg z-50 overflow-hidden py-1"
            >
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
                Active endpoint
              </div>
              {endpoints.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No endpoints configured.{' '}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => { setEndpointOpen(false); navigate('/endpoints'); }}
                  >
                    Add one
                  </button>
                </div>
              )}
              {(endpoints as any[]).map((ep) => {
                const id = ep._id ?? ep.id;
                const active = id === selectedEndpointId;
                return (
                  <button
                    key={id}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => { setSelectedEndpoint(id); setEndpointOpen(false); }}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors',
                      active && 'bg-muted font-medium',
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Server className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate">{ep.name}</span>
                    </span>
                    {active && <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
              <div className="border-t px-1 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-7"
                  onClick={() => { setEndpointOpen(false); navigate('/endpoints'); }}
                >
                  Manage endpoints
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Language switcher */}
        <div className="relative" ref={langRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Change language"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                onClick={() => setLangOpen(!langOpen)}
              >
                <Globe className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Language</TooltipContent>
          </Tooltip>
          {langOpen && (
            <div className="absolute right-0 top-12 w-44 bg-background border rounded-lg shadow-lg z-50 overflow-hidden py-1">
              {langs.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false); }}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition-colors',
                    i18n.language.startsWith(lang.code) && 'bg-muted font-medium',
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bell with dropdown */}
        <div className="relative" ref={bellRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
                aria-haspopup="menu"
                aria-expanded={bellOpen}
                onClick={() => setBellOpen(!bellOpen)}
              >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          {bellOpen && (
            <div className="absolute right-0 top-12 w-80 bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="font-semibold text-sm">Notifications</p>
                {unread > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => markAllMutation.mutate()}
                  >
                    <CheckCheck className="w-3 h-3 mr-1" />
                    Mark all read
                  </Button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
                ) : (
                  notifications.map((n: any) => (
                    <div
                      key={n._id}
                      className={cn('flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-blue-50/30')}
                    >
                      <div className="mt-0.5">{levelIcon[n.level] || levelIcon.info}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{n.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(n.createdAt)}</p>
                      </div>
                      {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />}
                    </div>
                  ))
                )}
              </div>

              <div className="border-t px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => { setBellOpen(false); navigate('/notifications'); }}
                >
                  View all notifications
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium">{user?.username}</p>
            <Badge variant={roleColors[user?.role || 'standard']} className="text-xs py-0">
              {user?.role}
            </Badge>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

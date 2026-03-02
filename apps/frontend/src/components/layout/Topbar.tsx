import { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, CheckCheck, Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';

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
  const queryClient = useQueryClient();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

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

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-preview'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
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
        {/* Bell with dropdown */}
        <div className="relative" ref={bellRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setBellOpen(!bellOpen)}
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Button>

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

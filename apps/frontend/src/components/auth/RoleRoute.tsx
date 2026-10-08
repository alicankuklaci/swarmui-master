import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';

interface RoleRouteProps {
  allow: string[];
  children: React.ReactNode;
}

/**
 * Route guard: redirects to /login if unauthenticated, to / if authenticated
 * but outside the allow list. The auth store currently exposes a single
 * `user.role` string; this matches on that. If the backend ever moves to a
 * `roles: string[]` or permission flags, extend the check here only.
 */
export function RoleRoute({ allow, children }: RoleRouteProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) return <Navigate to="/login" replace />;

  const role = user.role;
  if (!role || !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

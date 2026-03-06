import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Wait for Zustand persist to rehydrate from localStorage
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  if (!hydrated) return null; // blank while reading localStorage
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

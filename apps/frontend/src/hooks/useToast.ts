import { useCallback, useEffect, useState } from 'react';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

type Listener = (toasts: Toast[]) => void;

const listeners: Listener[] = [];
let toastList: Toast[] = [];

function emit() {
  // Snapshot copy so consumers always get a new reference.
  const snapshot = toastList.slice();
  for (const listener of listeners) listener(snapshot);
}

/**
 * Fire-and-forget toast. Can be called from any module (not just React).
 * Dispatches to subscribed hooks and the global Toaster.
 */
export function toast(input: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const next = { ...input, id };
  toastList = [...toastList, next];
  emit();
  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    emit();
  }, 4000);
  return id;
}

/**
 * React hook that returns the live `toasts` array, re-rendering on changes.
 * Fixes the earlier bug where `toasts` was a frozen initial snapshot.
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastList);

  useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.push(listener);
    // Resync in case toasts fired between render and effect.
    setToasts(toastList.slice());
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.push(listener);
    // Prime new subscriber with current state.
    listener(toastList.slice());
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return { toasts, toast, subscribe };
}

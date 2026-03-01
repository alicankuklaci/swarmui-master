import { useState, useCallback } from 'react';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

const listeners: Array<(toasts: Toast[]) => void> = [];
let toastList: Toast[] = [];

function updateToasts(toasts: Toast[]) {
  toastList = toasts;
  listeners.forEach((listener) => listener(toasts));
}

export function toast(toast: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const newToast = { ...toast, id };
  updateToasts([...toastList, newToast]);
  setTimeout(() => {
    updateToasts(toastList.filter((t) => t.id !== id));
  }, 4000);
  return id;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastList);

  const subscribe = useCallback((listener: (toasts: Toast[]) => void) => {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return { toasts, toast, subscribe };
}

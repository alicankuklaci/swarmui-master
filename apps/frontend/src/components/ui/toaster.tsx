import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

export function Toaster() {
  const { toasts, subscribe } = useToast();
  const [localToasts, setLocalToasts] = useState(toasts);

  useEffect(() => {
    return subscribe(setLocalToasts);
  }, [subscribe]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {localToasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 shadow-lg bg-background',
            t.variant === 'destructive' && 'border-destructive bg-destructive/10',
          )}
        >
          <div className="flex-1">
            {t.title && <p className="font-semibold text-sm">{t.title}</p>}
            {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

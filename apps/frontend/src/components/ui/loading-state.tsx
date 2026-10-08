import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  className?: string;
  inline?: boolean;
}

/**
 * Full-area loading state. Prefer this over hand-rolled divs.
 * Pass `inline` for a subtle refetch indicator (dot + optional text).
 */
export function LoadingState({ message = 'Loading…', className, inline = false }: LoadingStateProps) {
  if (inline) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
        aria-live="polite"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        {message}
      </span>
    );
  }
  return (
    <div
      className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

interface SkeletonProps {
  rows?: number;
  cols?: number;
  className?: string;
}

/** Table placeholder skeleton. Renders a grid of pulsing bars. */
export function Skeleton({ rows = 5, cols = 4, className }: SkeletonProps) {
  return (
    <div className={cn('space-y-2 p-4', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 flex-1 rounded bg-muted animate-pulse"
              style={{ opacity: 1 - r * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

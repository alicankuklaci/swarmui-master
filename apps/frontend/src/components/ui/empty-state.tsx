import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Centered, muted empty state. Use when a list/collection has zero items
 * so the user understands the state and sees the next action.
 */
export function EmptyState({ icon: Icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 text-muted-foreground',
        className,
      )}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      {message && <p className="text-sm mt-1 max-w-md">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

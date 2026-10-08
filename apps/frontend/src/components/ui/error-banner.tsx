import * as React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  title?: string;
  message?: string;
  details?: string;
  onDismiss?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Destructive banner used for query/mutation errors. Scrollable details
 * section preserves whitespace so stack traces and multi-line messages
 * remain readable. Announces politely for assistive tech.
 */
export function ErrorBanner({
  title = 'Something went wrong',
  message,
  details,
  onDismiss,
  className,
  children,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{title}</p>
          {message && <p className="mt-0.5 opacity-90">{message}</p>}
          {details && (
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs opacity-80">
              {details}
            </pre>
          )}
          {children}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="flex-shrink-0 rounded hover:bg-destructive/10 p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

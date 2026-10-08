import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { to: string; label?: string };
  className?: string;
}

/**
 * Consistent page header: back-link, title + description on the left,
 * actions block on the right. Replaces hand-rolled h1 blocks per page.
 */
export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {back && (
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 h-7 px-2 text-muted-foreground">
            <Link to={back.to}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
              {back.label ?? 'Back'}
            </Link>
          </Button>
        )}
        <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

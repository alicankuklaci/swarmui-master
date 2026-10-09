import { useState } from 'react';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

/**
 * Minimal code viewer with a copy button in the corner.
 * Reuses the clipboard pattern from StackDetailPage so the UX is consistent.
 */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore silently */
    }
  };

  return (
    <div className={cn('relative group', className)}>
      <pre className="bg-muted/60 dark:bg-muted/40 border rounded-md p-3 overflow-x-auto text-xs leading-relaxed">
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute top-2 right-2 opacity-70 hover:opacity-100"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
      >
        {copied ? <CheckIcon className="w-3.5 h-3.5 text-green-500" /> : <CopyIcon className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}

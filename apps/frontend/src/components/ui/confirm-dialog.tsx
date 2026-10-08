import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: React.ReactNode;
  variant?: 'default' | 'destructive';
  /** When set, user must type the exact phrase before confirm is enabled. */
  typeToConfirm?: { phrase: string; hint?: React.ReactNode };
  /** Optional preview of what the destructive action will cascade/affect. */
  cascade?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

/**
 * Replaces native `confirm()`. Supports three escalation tiers:
 *   - default: single-click confirm
 *   - destructive: red button + 1s cooldown so a fat-finger doesn't nuke
 *   - destructive + typeToConfirm: must type the exact phrase to enable
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  variant = 'default',
  typeToConfirm,
  cascade,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');
  const [cooldownLeft, setCooldownLeft] = React.useState(0);
  const [running, setRunning] = React.useState(false);

  // Reset state when dialog opens; start 1s cooldown for destructive.
  React.useEffect(() => {
    if (!open) {
      setTyped('');
      setCooldownLeft(0);
      setRunning(false);
      return;
    }
    if (variant !== 'destructive') return;
    setCooldownLeft(1000);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, 1000 - (Date.now() - started));
      setCooldownLeft(left);
      if (left === 0) clearInterval(tick);
    }, 100);
    return () => clearInterval(tick);
  }, [open, variant]);

  const typeOk = !typeToConfirm || typed === typeToConfirm.phrase;
  const isLoading = loading || running;
  const disabled = isLoading || cooldownLeft > 0 || !typeOk;

  async function handleConfirm() {
    try {
      setRunning(true);
      await onConfirm();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isLoading) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && <DialogDescription>{message}</DialogDescription>}
        </DialogHeader>

        {cascade && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm max-h-48 overflow-y-auto">
            {cascade}
          </div>
        )}

        {typeToConfirm && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {typeToConfirm.hint ?? (
                <>
                  Type <code className="font-mono bg-muted px-1 rounded">{typeToConfirm.phrase}</code> to confirm
                </>
              )}
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              placeholder={typeToConfirm.phrase}
              className="font-mono"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={disabled}
            autoFocus={!typeToConfirm}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {cooldownLeft > 0 ? `${confirmLabel} (${Math.ceil(cooldownLeft / 1000)})` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Imperative useConfirm() ───────────────────────────────────────────────

type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'loading'>;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

interface InternalState extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/** Provider for the imperative `useConfirm()` hook. Mount once near the root. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<InternalState | null>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
      setLoading(false);
      setOpen(true);
    });
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setOpen(false);
    // Delay unmount so dialog animates out
    setTimeout(() => setState(null), 150);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <ConfirmDialog
          open={open}
          onOpenChange={(v) => { if (!v) close(false); }}
          title={state.title}
          message={state.message}
          variant={state.variant}
          typeToConfirm={state.typeToConfirm}
          cascade={state.cascade}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          loading={loading}
          onConfirm={async () => {
            setLoading(true);
            close(true);
          }}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Imperative confirmation prompt. Returns a promise that resolves to true
 * if the user confirms, false otherwise. Replaces native `confirm()`.
 */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm() must be used inside <ConfirmProvider>');
  }
  return ctx.confirm;
}

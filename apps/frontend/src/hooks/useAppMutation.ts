import { useMutation, useQueryClient, type MutationFunction, type QueryKey } from '@tanstack/react-query';
import { toast } from '@/hooks/useToast';

interface AppMutationOptions<TData, TError, TVariables> {
  /** Shown as a success toast. If a function, receives the response data. */
  successMessage?: string | ((data: TData) => string);
  /** Shown as a destructive toast title. Falls back to err.response.data.message || err.message. */
  errorMessage?: string | ((err: TError) => string);
  /** Query keys to invalidate on success. */
  invalidate?: QueryKey[];
  /** Called after the default success handling. */
  onSuccess?(data: TData, vars: TVariables): void;
  /** Called after the default error handling. */
  onError?(err: TError, vars: TVariables): void;
  /**
   * If the response has `services[]` with `action === 'failed'`, treat as error
   * and surface a per-item breakdown. Returns a resolved mutation but toasts
   * destructive — pages that need to render inline detail can read it via onSuccess.
   */
  checkPerItem?: boolean;
}

function extractErrorMessage(err: any): string {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    'Request failed'
  );
}

/**
 * Wrapper over `useMutation` that enforces consistent error toasts, optional
 * success toasts, cache invalidation, and per-item failure detection for
 * endpoints that return multi-service results.
 *
 * This is the sanctioned mutation path. Any mutation that calls `useMutation`
 * directly is at risk of silent failure (the "deploy succeeded while 2
 * services failed" bug class we hit in production).
 */
export function useAppMutation<TData = unknown, TError = unknown, TVariables = void>(
  mutationFn: MutationFunction<TData, TVariables>,
  opts: AppMutationOptions<TData, TError, TVariables> = {},
) {
  const qc = useQueryClient();

  return useMutation<TData, TError, TVariables>({
    mutationFn,
    onSuccess: (data, vars) => {
      // Per-item failure check: surface partial-fail as error.
      if (opts.checkPerItem) {
        const services = (data as any)?.services;
        if (Array.isArray(services)) {
          const failed = services.filter((s: any) => s?.action === 'failed');
          if (failed.length > 0) {
            const summary = failed
              .map((s: any) => `• ${s.name ?? '?'}: ${s.error ?? 'unknown error'}`)
              .join('\n');
            toast({
              variant: 'destructive',
              title: `${failed.length} item(s) failed`,
              description: summary,
            });
            // Still fire user onError so the caller can show inline detail.
            opts.onError?.(data as unknown as TError, vars);
            return;
          }
        }
      }

      if (opts.successMessage) {
        const title = typeof opts.successMessage === 'function'
          ? opts.successMessage(data)
          : opts.successMessage;
        toast({ title });
      }

      if (opts.invalidate) {
        for (const key of opts.invalidate) {
          qc.invalidateQueries({ queryKey: key });
        }
      }

      opts.onSuccess?.(data, vars);
    },
    onError: (err, vars) => {
      const description = typeof opts.errorMessage === 'function'
        ? opts.errorMessage(err)
        : opts.errorMessage ?? extractErrorMessage(err);
      toast({ variant: 'destructive', title: 'Error', description });
      opts.onError?.(err, vars);
    },
  });
}

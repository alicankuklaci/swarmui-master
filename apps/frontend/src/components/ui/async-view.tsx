import * as React from 'react';
import { LoadingState } from './loading-state';
import { ErrorBanner } from './error-banner';

/**
 * Minimal subset of a TanStack Query result we care about.
 * Loose typing keeps this reusable for both useQuery and useQueries.
 */
interface QueryLike<TData, TError = unknown> {
  data: TData | undefined;
  isPending?: boolean;
  isLoading?: boolean;
  isError: boolean;
  error: TError | null;
  isFetching?: boolean;
}

interface AsyncViewProps<TData, TError> {
  query: QueryLike<TData, TError>;
  children: (data: TData) => React.ReactNode;
  loading?: React.ReactNode;
  empty?: React.ReactNode;
  error?: React.ReactNode;
  /** Predicate to detect empty; defaults to Array.isArray(d) && d.length===0 */
  isEmpty?: (data: TData) => boolean;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

/**
 * Unifies the four render states (loading / error / empty / data) that every
 * query-driven page re-rolls today. Prefers to show cached `data` during
 * background refetch (isPending vs isLoading) to reduce layout flashes.
 *
 * @example
 *   <AsyncView query={query} empty={<EmptyState title="None" />}>
 *     {(rows) => <Table rows={rows} />}
 *   </AsyncView>
 */
export function AsyncView<TData, TError = unknown>({
  query,
  children,
  loading,
  empty,
  error,
  isEmpty = defaultIsEmpty as (data: TData) => boolean,
}: AsyncViewProps<TData, TError>) {
  // Prefer isPending (TanStack v5): true only on the first load with no cache.
  const pending = query.isPending ?? query.isLoading ?? false;

  if (pending && query.data === undefined) {
    return <>{loading ?? <LoadingState />}</>;
  }

  if (query.isError && query.data === undefined) {
    const err = query.error as any;
    return (
      <>
        {error ?? (
          <ErrorBanner
            message={err?.response?.data?.message || err?.message || 'Request failed'}
          />
        )}
      </>
    );
  }

  if (query.data !== undefined && isEmpty(query.data)) {
    return <>{empty ?? null}</>;
  }

  return <>{query.data !== undefined ? children(query.data) : null}</>;
}

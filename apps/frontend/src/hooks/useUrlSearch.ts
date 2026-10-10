import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Debounced, URL-synced search input state.
 *
 *   const { query, setQuery, debounced } = useUrlSearch();
 *   const filtered = rows.filter(r => r.name.toLowerCase().includes(debounced.toLowerCase()));
 *
 * - `query` is the immediate value for the input (`value={query}`).
 * - `debounced` is what you filter by (default 300 ms).
 * - URL is kept in sync as `?q=<value>` (not pushed to history, so refreshes
 *   keep the query but Back doesn't dump every keystroke).
 * - `paramKey` lets you use something other than `q` if two searches coexist.
 */
export function useUrlSearch(opts: { debounceMs?: number; paramKey?: string } = {}) {
  const { debounceMs = 300, paramKey = 'q' } = opts;
  const [params, setParams] = useSearchParams();
  const initial = params.get(paramKey) || '';
  const [query, setQuery] = useState<string>(initial);
  const [debounced, setDebounced] = useState<string>(initial);

  // Debounce query → debounced
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), debounceMs);
    return () => clearTimeout(h);
  }, [query, debounceMs]);

  // Sync debounced → URL (replace, not push)
  useEffect(() => {
    const current = params.get(paramKey) || '';
    if (current === debounced) return;
    const next = new URLSearchParams(params);
    if (debounced) next.set(paramKey, debounced);
    else next.delete(paramKey);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const clear = useCallback(() => setQuery(''), []);

  return useMemo(
    () => ({ query, setQuery, debounced, clear }),
    [query, debounced, clear],
  );
}

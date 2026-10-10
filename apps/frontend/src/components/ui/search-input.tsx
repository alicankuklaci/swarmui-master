import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (next: string) => void;
  /** Shown placeholder; defaults to "Search…". */
  placeholder?: string;
  /** Optional max-w utility class override. Defaults to `max-w-sm`. */
  widthClass?: string;
  /** Shown as the aria-label for the clear button. Defaults to "Clear search". */
  clearLabel?: string;
}

/**
 * Debounce-free controlled search input with a leading search icon and a
 * clear-button that appears when there's a value. Pair with
 * `useUrlSearch()` to get a debounced URL-synced value.
 *
 *   const { query, setQuery, debounced } = useUrlSearch();
 *   <SearchInput value={query} onChange={setQuery} placeholder="Search containers" />
 *   const filtered = rows.filter(r => r.name.toLowerCase().includes(debounced.toLowerCase()));
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = 'Search…', widthClass = 'max-w-sm', clearLabel = 'Clear search', className, ...rest }, ref) => {
    return (
      <div className={cn('relative', widthClass)}>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={ref}
          type="search"
          role="searchbox"
          aria-label={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('pl-9 pr-9', className)}
          {...rest}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={clearLabel}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';

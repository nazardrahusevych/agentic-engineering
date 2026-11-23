import { emptyFilters, FILTER_KEYS, type FilterKey, type Filters } from './browse.ts';
import { MAX_QUERY_CHARS } from './text.ts';

export interface UrlState {
  q: string;
  filters: Filters;
}

/** The values each filter may take; anything else in a URL is dropped (AC-25). */
export type KnownValues = Record<FilterKey, ReadonlySet<string>>;

/** Reads `?q=…&type=skill&type=agent&plugin=…&category=…&tag=…`. Unknown filter values are ignored. */
export function parseUrlState(search: string, known: KnownValues): UrlState {
  const params = new URLSearchParams(search);
  const filters = emptyFilters();
  for (const key of FILTER_KEYS) {
    for (const value of params.getAll(key)) {
      if (known[key].has(value) && !filters[key].includes(value)) filters[key].push(value);
    }
  }
  return { q: (params.get('q') ?? '').slice(0, MAX_QUERY_CHARS), filters };
}

/** Writes the state as a query string with a stable key order; empty values are left out. Returns '' when empty. */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.q.trim() !== '') params.set('q', state.q);
  for (const key of FILTER_KEYS) {
    for (const value of [...state.filters[key]].sort()) params.append(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

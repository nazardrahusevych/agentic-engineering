import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntry } from '../../catalog/types.ts';
import { applyFilters, emptyFilters, facetCounts, FILTER_KEYS, orderResults, valuesOf, type FilterKey } from '../../search/browse.ts';
import { search, type SearchIndex } from '../../search/engine.ts';
import { MAX_QUERY_CHARS } from '../../search/text.ts';
import { parseUrlState, serializeUrlState, type KnownValues, type UrlState } from '../../search/url-state.ts';

export const DEBOUNCE_MS = 80;

function knownValues(entries: CatalogEntry[]): KnownValues {
  const known = {} as Record<FilterKey, Set<string>>;
  for (const key of FILTER_KEYS) known[key] = new Set(entries.flatMap((entry) => valuesOf(entry, key)));
  return known;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Query and filter state of the landing page: restored from and written to the URL (AC-25), searched locally
 * after a short debounce (AC-10), and focused with "/" (AC-18).
 */
export function useSearchState(entries: CatalogEntry[], index: SearchIndex) {
  const known = useMemo(() => knownValues(entries), [entries]);
  const [state, setState] = useState<UrlState>(() => parseUrlState(window.location.search, known));
  const [debouncedQ, setDebouncedQ] = useState(state.q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debouncedQ === state.q) return undefined;
    const timer = setTimeout(() => setDebouncedQ(state.q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.q, debouncedQ]);

  useEffect(() => {
    const search = serializeUrlState(state);
    if (search !== window.location.search) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [state]);

  useEffect(() => {
    const onPopState = () => {
      const next = parseUrlState(window.location.search, known);
      setState(next);
      setDebouncedQ(next.q);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [known]);

  const matched = useMemo(() => orderResults(entries, search(index, debouncedQ)), [entries, index, debouncedQ]);
  const results = useMemo(() => applyFilters(matched, state.filters), [matched, state.filters]);
  const counts = useMemo(() => facetCounts(matched, state.filters), [matched, state.filters]);

  const setQuery = useCallback((q: string) => setState((prev) => ({ ...prev, q: q.slice(0, MAX_QUERY_CHARS) })), []);
  const toggleFilter = useCallback((key: FilterKey, value: string) => {
    setState((prev) => {
      const current = prev.filters[key];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return { ...prev, filters: { ...prev.filters, [key]: next } };
    });
  }, []);
  const clearFilters = useCallback(() => {
    setState((prev) => ({ ...prev, filters: emptyFilters() }));
  }, []);

  return { state, results, counts, inputRef, setQuery, toggleFilter, clearFilters };
}

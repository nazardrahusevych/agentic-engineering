import { useEffect, useState } from 'react';
import type { CatalogDocument } from '../../catalog/types.ts';
import { en } from '../../i18n/en.ts';
import { hasActiveFilters } from '../../search/browse.ts';
import { loadIndex, type SearchIndex } from '../../search/engine.ts';
import { requestIssueUrl } from '../../search/request-link.ts';
import type { SearchIndexFile } from '../../search/types.ts';
import EmptyState from './EmptyState.tsx';
import FilterPanel from './FilterPanel.tsx';
import ResultCard from './ResultCard.tsx';
import { useSearchState } from './use-search-state.ts';

interface Props {
  base: string;
  repo: string;
}

type Data = { catalog: CatalogDocument; index: SearchIndex };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Loads the catalog and the search index once, in parallel; everything after that is local (AC-10). */
function useCatalogData(base: string) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchJson<CatalogDocument>(`${base}catalog.json`), fetchJson<SearchIndexFile>(`${base}search-index.json`)])
      .then(([catalog, indexFile]) => {
        if (!cancelled) setData({ catalog, index: loadIndex(indexFile) });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [base]);
  return { data, error };
}

export default function SearchApp({ base, repo }: Props) {
  const { data, error } = useCatalogData(base);
  if (error) {
    return (
      <p className="status" role="alert">
        {en.search.loadError}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="status" role="status">
        {en.search.loading}
      </p>
    );
  }
  return <Browser data={data} base={base} repo={repo} />;
}

function Browser({ data, base, repo }: { data: Data; base: string; repo: string }) {
  const { state, results, counts, inputRef, setQuery, toggleFilter, clearFilters } = useSearchState(
    data.catalog.entries,
    data.index,
  );
  const filtersSet = hasActiveFilters(state.filters);

  return (
    <div className="search-layout">
      <aside>
        <FilterPanel counts={counts} onToggle={toggleFilter} />
      </aside>
      <section aria-labelledby="results-heading">
        <form className="search-box" role="search" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="catalog-search">{en.search.label}</label>
          <input
            id="catalog-search"
            ref={inputRef}
            type="search"
            name="q"
            value={state.q}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="search-hint"
            placeholder={en.search.placeholder}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <p id="search-hint" className="hint">
            {en.search.hintBefore} <kbd>{en.search.hintKey}</kbd> {en.search.hintAfter}
          </p>
        </form>
        <h2 id="results-heading" className="visually-hidden">
          {en.search.resultsHeading}
        </h2>
        <p className="result-count" role="status" aria-live="polite" data-testid="result-count">
          {en.search.count(results.length)}
        </p>
        {results.length === 0 ? (
          <EmptyState
            hasFilters={filtersSet}
            catalogEmpty={data.catalog.entries.length === 0}
            onClearFilters={clearFilters}
            requestUrl={requestIssueUrl(repo, state)}
          />
        ) : (
          <ul className="cards">
            {results.map((entry) => (
              <li key={`${entry.type}/${entry.id}`}>
                <ResultCard entry={entry} base={base} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CatalogDocument } from '../../catalog/types.ts';
import { orderResults } from '../../search/browse.ts';
import { loadIndex, type SearchIndex } from '../../search/engine.ts';
import type { SearchIndexFile } from '../../search/types.ts';
import ResultCard from './ResultCard.tsx';

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

/** Loads the catalog and the search index once, in parallel, then works locally. */
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

export default function SearchApp({ base }: Props) {
  const { data, error } = useCatalogData(base);
  const results = useMemo(() => (data ? orderResults(data.catalog.entries, null) : []), [data]);

  if (error) {
    return (
      <p class="status" role="alert">
        The catalog could not be loaded. Reload the page to try again.
      </p>
    );
  }
  if (!data) {
    return (
      <p class="status" role="status">
        Loading the catalog…
      </p>
    );
  }
  return (
    <section aria-labelledby="results-heading">
      <h2 id="results-heading" class="visually-hidden">
        Results
      </h2>
      <p class="result-count" role="status" aria-live="polite" data-testid="result-count">
        {results.length === 1 ? '1 artifact' : `${results.length} artifacts`}
      </p>
      <ul class="cards">
        {results.map((entry) => (
          <li key={`${entry.type}/${entry.id}`}>
            <ResultCard entry={entry} base={base} />
          </li>
        ))}
      </ul>
    </section>
  );
}

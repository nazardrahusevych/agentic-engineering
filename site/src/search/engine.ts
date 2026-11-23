import MiniSearch, { type Options, type SearchOptions } from 'minisearch';
import { normalize, prepareQuery, stem, STOPWORDS, transpositions } from './text.ts';
import type { SearchDoc, SearchHit, SearchIndexFile } from './types.ts';

/** Body text indexed per artifact; keeps the index within the 400 KB budget (NFR). */
export const BODY_INDEX_CHARS = 4000;

const PRIMARY_FIELDS = new Set(['name', 'description', 'tags']);

const QUERY_OPTIONS: SearchOptions = {
  prefix: true,
  fuzzy: (term) => (term.length >= 5 ? 1 : 0),
  boost: { name: 4, tags: 3, description: 2, plugin: 1.5, body: 1 },
  combineWith: 'OR',
  // Query words are already normalized and stemmed by prepareQuery.
  tokenize: (text) => [text],
  processTerm: (term) => term,
};

/** Options shared by the build (indexing) and the browser (loading the index). */
export const SEARCH_OPTIONS: Options<SearchDoc> = {
  idField: 'id',
  fields: ['name', 'description', 'tags', 'plugin', 'body'],
  storeFields: [],
  extractField: (doc, field) => {
    const value = doc[field as keyof SearchDoc];
    return Array.isArray(value) ? value.join(' ') : value;
  },
  tokenize: (text) => normalize(text),
  processTerm: (term) => (STOPWORDS.has(term) ? null : stem(term)),
  searchOptions: QUERY_OPTIONS,
};

export type SearchIndex = MiniSearch<SearchDoc>;

export function createIndex(docs: SearchDoc[]): SearchIndex {
  const index = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  index.addAll(docs.map((doc) => ({ ...doc, body: doc.body.slice(0, BODY_INDEX_CHARS) })));
  return index;
}

export function serializeIndex(index: SearchIndex): SearchIndexFile {
  return { version: 1, minisearch: index.toJSON() };
}

export function loadIndex(file: SearchIndexFile): SearchIndex {
  if (file.version !== 1) throw new Error(`unsupported search index version ${String(file.version)}`);
  return MiniSearch.loadJS<SearchDoc>(file.minisearch, SEARCH_OPTIONS);
}

/**
 * Searches the index with a plain-text query (AC-10 – AC-14, AC-32). Returns null when the query has no words
 * left after dropping filler words, meaning "no query". Hits are sorted by matched words, then by a match in
 * name, description or tags, then by score.
 */
export function search(index: SearchIndex, query: string): SearchHit[] | null {
  const words = prepareQuery(query);
  if (words.length === 0) return null;
  const hits = new Map<string, SearchHit>();
  for (const word of words) {
    const results = index.search({ combineWith: 'OR', queries: [word, ...transpositions(word)] }, QUERY_OPTIONS);
    for (const result of results) {
      const id = String(result.id);
      const hit = hits.get(id) ?? { id, score: 0, matchedWords: 0, primaryHit: false };
      hit.matchedWords += 1;
      hit.score += result.score;
      if (!hit.primaryHit) {
        hit.primaryHit = Object.values(result.match).some((fields) => fields.some((field) => PRIMARY_FIELDS.has(field)));
      }
      hits.set(id, hit);
    }
  }
  return [...hits.values()].sort(compareHits);
}

export function compareHits(a: SearchHit, b: SearchHit): number {
  return (
    b.matchedWords - a.matchedWords ||
    Number(b.primaryHit) - Number(a.primaryHit) ||
    b.score - a.score
  );
}

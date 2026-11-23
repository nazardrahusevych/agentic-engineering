import type { AsPlainObject } from 'minisearch';

/** One document of the search index. `id` is the artifact's detail path. */
export interface SearchDoc {
  id: string;
  name: string;
  description: string;
  tags: string[];
  plugin: string;
  body: string;
}

/** The published `search-index.json`, kept apart from `catalog.json` so phase 2 can add vectors next to it. */
export interface SearchIndexFile {
  version: 1;
  minisearch: AsPlainObject;
}

export interface SearchHit {
  id: string;
  score: number;
  /** How many prepared query words matched this document (AC-14). */
  matchedWords: number;
  /** Whether any match is in the name, description or tags (AC-12). */
  primaryHit: boolean;
}

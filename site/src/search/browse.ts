import type { ArtifactType, CatalogEntry } from '../catalog/types.ts';
import { compareHits } from './engine.ts';
import type { SearchHit } from './types.ts';

/** Landing order of the types (AC-15): plugins first, then components grouped by type. */
export const TYPE_ORDER: readonly ArtifactType[] = ['plugin', 'skill', 'agent', 'command', 'hooks', 'mcp'];

/** Code-point comparison of lowercased text, then raw text: stable across locales. */
export function compareText(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

const SEGMENT: Record<Exclude<ArtifactType, 'plugin' | 'hooks'>, string> = {
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
  mcp: 'mcp',
};

/** Detail page path relative to the site base (AC-26); also the key of an entry in the search index. */
export function detailPath(type: ArtifactType, plugin: string, name: string): string {
  if (type === 'plugin') return `plugins/${plugin}/`;
  if (type === 'hooks') return `plugins/${plugin}/hooks/`;
  return `plugins/${plugin}/${SEGMENT[type]}/${name}/`;
}

export type BrowseEntry = Pick<CatalogEntry, 'type' | 'name' | 'plugin' | 'category' | 'tags'>;

export function entryKey(entry: BrowseEntry): string {
  return detailPath(entry.type, entry.plugin, entry.name);
}

/** Landing order (AC-15): type order, then name, then plugin. */
export function landingCompare(a: BrowseEntry, b: BrowseEntry): number {
  return (
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
    compareText(a.name, b.name) ||
    compareText(a.plugin, b.plugin)
  );
}

export const FILTER_KEYS = ['type', 'plugin', 'category', 'tag'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Record<FilterKey, string[]>;

export function emptyFilters(): Filters {
  return { type: [], plugin: [], category: [], tag: [] };
}

export function hasActiveFilters(filters: Filters): boolean {
  return FILTER_KEYS.some((key) => filters[key].length > 0);
}

/** The values an entry has for one filter. */
export function valuesOf(entry: BrowseEntry, key: FilterKey): string[] {
  switch (key) {
    case 'type':
      return [entry.type];
    case 'plugin':
      return [entry.plugin];
    case 'category':
      return entry.category ? [entry.category] : [];
    case 'tag':
      return entry.tags;
  }
}

function matches(entry: BrowseEntry, filters: Filters, skip?: FilterKey): boolean {
  return FILTER_KEYS.every((key) => {
    if (key === skip || filters[key].length === 0) return true;
    const values = valuesOf(entry, key);
    return filters[key].some((selected) => values.includes(selected));
  });
}

/** OR within one filter, AND across filters (AC-24). */
export function applyFilters<T extends BrowseEntry>(entries: T[], filters: Filters): T[] {
  return entries.filter((entry) => matches(entry, filters));
}

export interface FacetOption {
  value: string;
  count: number;
  selected: boolean;
}

export type FacetCounts = Record<FilterKey, FacetOption[]>;

/**
 * Disjunctive facet counts (AC-23): the counts of one filter use every other filter but not its own selection, so
 * picking "skill" does not zero the "agent" count. Options with a zero count are kept only when selected.
 */
export function facetCounts(entries: BrowseEntry[], filters: Filters): FacetCounts {
  const result = {} as FacetCounts;
  for (const key of FILTER_KEYS) {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!matches(entry, filters, key)) continue;
      for (const value of new Set(valuesOf(entry, key))) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const selected of filters[key]) if (!counts.has(selected)) counts.set(selected, 0);
    const options = [...counts].map(([value, count]) => ({ value, count, selected: filters[key].includes(value) }));
    options.sort((a, b) =>
      key === 'type'
        ? TYPE_ORDER.indexOf(a.value as ArtifactType) - TYPE_ORDER.indexOf(b.value as ArtifactType)
        : compareText(a.value, b.value),
    );
    result[key] = options;
  }
  return result;
}

/** Landing order without a query; otherwise only the hits, in hit order with landing order as the tie-break. */
export function orderResults<T extends BrowseEntry>(entries: T[], hits: SearchHit[] | null): T[] {
  if (hits === null) return [...entries].sort(landingCompare);
  const byKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const ranked = hits
    .map((hit) => ({ hit, entry: byKey.get(hit.id) }))
    .filter((item): item is { hit: SearchHit; entry: T } => item.entry !== undefined);
  ranked.sort((a, b) => compareHits(a.hit, b.hit) || landingCompare(a.entry, b.entry));
  return ranked.map((item) => item.entry);
}

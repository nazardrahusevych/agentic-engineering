import { describe, expect, it } from 'vitest';
import type { ArtifactType } from '../catalog/types.ts';
import {
  applyFilters,
  emptyFilters,
  entryKey,
  facetCounts,
  hasActiveFilters,
  landingCompare,
  orderResults,
  type BrowseEntry,
  type Filters,
} from './browse.ts';

const entry = (type: ArtifactType, plugin: string, name: string, category: string | null, tags: string[] = []): BrowseEntry => ({
  type,
  plugin,
  name,
  category,
  tags,
});

const entries: BrowseEntry[] = [
  entry('agent', 'beta', 'planner', 'workflow', ['specs']),
  entry('skill', 'beta', 'code-review', 'workflow', ['specs']),
  entry('mcp', 'alpha', 'docs-search', 'quality', ['review']),
  entry('plugin', 'beta', 'beta', 'workflow', ['specs']),
  entry('skill', 'alpha', 'code-review', 'quality', ['review', 'pr']),
  entry('hooks', 'alpha', 'hooks', 'quality', ['review']),
  entry('plugin', 'alpha', 'alpha', 'quality', ['review']),
  entry('command', 'alpha', 'deploy-check', 'quality', ['review']),
  entry('agent', 'alpha', 'reviewer', 'quality', ['review']),
];
const label = (e: BrowseEntry) => `${e.type}:${e.plugin}:${e.name}`;
const filters = (partial: Partial<Filters>): Filters => ({ ...emptyFilters(), ...partial });

describe('landing order (AC-15)', () => {
  it('plugins first, then components grouped by type, each by name then plugin', () => {
    expect([...entries].sort(landingCompare).map(label)).toEqual([
      'plugin:alpha:alpha',
      'plugin:beta:beta',
      'skill:alpha:code-review',
      'skill:beta:code-review',
      'agent:beta:planner',
      'agent:alpha:reviewer',
      'command:alpha:deploy-check',
      'hooks:alpha:hooks',
      'mcp:alpha:docs-search',
    ]);
    expect(orderResults(entries, null).map(label)).toEqual([...entries].sort(landingCompare).map(label));
  });
});

describe('applyFilters (AC-24)', () => {
  it('ORs the options of one filter', () => {
    expect(applyFilters(entries, filters({ type: ['skill', 'agent'] })).map(label).sort()).toEqual([
      'agent:alpha:reviewer',
      'agent:beta:planner',
      'skill:alpha:code-review',
      'skill:beta:code-review',
    ]);
  });

  it('ANDs different filters', () => {
    expect(applyFilters(entries, filters({ type: ['skill', 'agent'], plugin: ['beta'] })).map(label).sort()).toEqual([
      'agent:beta:planner',
      'skill:beta:code-review',
    ]);
    expect(applyFilters(entries, filters({ tag: ['pr'], category: ['workflow'] }))).toEqual([]);
  });

  it('no filters keep everything', () => {
    expect(applyFilters(entries, emptyFilters())).toHaveLength(entries.length);
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    expect(hasActiveFilters(filters({ tag: ['pr'] }))).toBe(true);
  });
});

describe('facetCounts (AC-23)', () => {
  it('counts the current result set', () => {
    const counts = facetCounts(entries, emptyFilters());
    expect(counts.type).toEqual([
      { value: 'plugin', count: 2, selected: false },
      { value: 'skill', count: 2, selected: false },
      { value: 'agent', count: 2, selected: false },
      { value: 'command', count: 1, selected: false },
      { value: 'hooks', count: 1, selected: false },
      { value: 'mcp', count: 1, selected: false },
    ]);
    expect(counts.plugin).toEqual([
      { value: 'alpha', count: 6, selected: false },
      { value: 'beta', count: 3, selected: false },
    ]);
    expect(counts.tag.find((option) => option.value === 'pr')?.count).toBe(1);
  });

  it('changes when the result set changes', () => {
    const subset = entries.filter((e) => e.plugin === 'beta');
    expect(facetCounts(subset, emptyFilters()).type.map((o) => `${o.value}=${o.count}`)).toEqual([
      'plugin=1',
      'skill=1',
      'agent=1',
    ]);
  });

  it('is disjunctive: a selected type does not zero the other types', () => {
    const counts = facetCounts(entries, filters({ type: ['skill'] }));
    expect(counts.type.find((o) => o.value === 'agent')).toEqual({ value: 'agent', count: 2, selected: false });
    expect(counts.type.find((o) => o.value === 'skill')).toEqual({ value: 'skill', count: 2, selected: true });
    // Other filters are narrowed by the type selection.
    expect(counts.plugin).toEqual([
      { value: 'alpha', count: 1, selected: false },
      { value: 'beta', count: 1, selected: false },
    ]);
  });

  it('keeps a selected option with a zero count', () => {
    const counts = facetCounts(entries, filters({ type: ['mcp'], plugin: ['beta'] }));
    expect(counts.type.find((o) => o.value === 'mcp')).toEqual({ value: 'mcp', count: 0, selected: true });
  });
});

describe('orderResults', () => {
  it('keeps only hits, in hit order, with landing order breaking ties', () => {
    const hits = [
      { id: entryKey(entries[1]!), score: 1, matchedWords: 1, primaryHit: true },
      { id: entryKey(entries[4]!), score: 1, matchedWords: 1, primaryHit: true },
      { id: entryKey(entries[0]!), score: 9, matchedWords: 2, primaryHit: false },
      { id: 'plugins/gone/', score: 9, matchedWords: 3, primaryHit: true },
    ];
    expect(orderResults(entries, hits).map(label)).toEqual([
      'agent:beta:planner',
      'skill:alpha:code-review',
      'skill:beta:code-review',
    ]);
  });
});

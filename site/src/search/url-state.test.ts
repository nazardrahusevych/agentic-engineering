import { describe, expect, it } from 'vitest';
import { emptyFilters } from './browse.ts';
import { parseUrlState, serializeUrlState, type KnownValues } from './url-state.ts';

const known: KnownValues = {
  type: new Set(['plugin', 'skill', 'agent']),
  plugin: new Set(['alpha', 'beta']),
  category: new Set(['quality']),
  tag: new Set(['review', 'c++ & co']),
};

describe('URL state (AC-25)', () => {
  it('round-trips the query and filters', () => {
    const state = {
      q: 'review pull requests',
      filters: { type: ['skill', 'agent'], plugin: ['beta'], category: ['quality'], tag: ['review'] },
    };
    const search = serializeUrlState(state);
    expect(search).toBe('?q=review+pull+requests&type=agent&type=skill&plugin=beta&category=quality&tag=review');
    const parsed = parseUrlState(search, known);
    expect(parsed.q).toBe(state.q);
    expect(parsed.filters).toEqual({ type: ['agent', 'skill'], plugin: ['beta'], category: ['quality'], tag: ['review'] });
  });

  it('drops unknown values and keeps the known ones', () => {
    const parsed = parseUrlState('?type=bogus&type=skill&plugin=nope&tag=review&extra=1', known);
    expect(parsed.filters).toEqual({ type: ['skill'], plugin: [], category: [], tag: ['review'] });
  });

  it('encodes special characters', () => {
    const state = { q: '<script>"&#', filters: { ...emptyFilters(), tag: ['c++ & co'] } };
    const search = serializeUrlState(state);
    expect(search).toBe('?q=%3Cscript%3E%22%26%23&tag=c%2B%2B+%26+co');
    expect(parseUrlState(search, known)).toEqual(state);
  });

  it('caps q at 200 characters and writes nothing for an empty state', () => {
    expect(parseUrlState(`?q=${'a'.repeat(300)}`, known).q).toHaveLength(200);
    expect(serializeUrlState({ q: '  ', filters: emptyFilters() })).toBe('');
  });
});

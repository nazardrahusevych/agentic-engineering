import { describe, expect, it } from 'vitest';
import { createIndex, loadIndex, search, serializeIndex } from './engine.ts';
import type { SearchDoc } from './types.ts';

const doc = (id: string, fields: Partial<SearchDoc>): SearchDoc => ({
  id,
  name: '',
  description: '',
  tags: [],
  plugin: 'p',
  body: '',
  ...fields,
});

const ids = (hits: { id: string }[] | null) => (hits ?? []).map((hit) => hit.id);

describe('search engine', () => {
  it('AC-11: matches each field on its own', () => {
    const index = createIndex([
      doc('name', { name: 'walrus' }),
      doc('description', { description: 'a walrus helper' }),
      doc('tags', { tags: ['walrus'] }),
      doc('plugin', { plugin: 'walrus' }),
      doc('body', { body: 'mentions a walrus once' }),
      doc('none', { name: 'other' }),
    ]);
    expect(ids(search(index, 'walrus')).sort()).toEqual(['body', 'description', 'name', 'plugin', 'tags']);
  });

  it('AC-12: a name match ranks above a body-only match', () => {
    const index = createIndex([
      doc('body', { name: 'helper', body: 'linting linting linting for every file' }),
      doc('name', { name: 'linting', body: 'checks style' }),
    ]);
    expect(ids(search(index, 'linting'))).toEqual(['name', 'body']);
  });

  it('AC-12: a description or tag match also ranks above a body-only match', () => {
    const index = createIndex([
      doc('body', { body: 'deploy deploy deploy deploy' }),
      doc('tags', { tags: ['deploy'] }),
    ]);
    const hits = search(index, 'deploy') ?? [];
    expect(ids(hits)).toEqual(['tags', 'body']);
    expect(hits[0]?.primaryHit).toBe(true);
    expect(hits[1]?.primaryHit).toBe(false);
  });

  it('AC-13: prefixes and one-edit typos find "security"; short words need an exact prefix', () => {
    const index = createIndex([doc('sec', { name: 'security-audit', description: 'security checks' }), doc('lint', { name: 'lint' })]);
    expect(ids(search(index, 'secur'))).toEqual(['sec']);
    expect(ids(search(index, 'secuirty'))).toEqual(['sec']);
    expect(ids(search(index, 'securty'))).toEqual(['sec']);
    expect(ids(search(index, 'lnit'))).toEqual([]);
  });

  it('AC-14: more matched words rank higher', () => {
    const index = createIndex([
      doc('one', { name: 'alpha tool', description: 'alpha alpha alpha' }),
      doc('two', { body: 'alpha and gamma' }),
    ]);
    const hits = search(index, 'alpha beta gamma') ?? [];
    expect(ids(hits)).toEqual(['two', 'one']);
    expect(hits[0]?.matchedWords).toBe(2);
  });

  it('AC-32: the example sentence ranks the review docs first', () => {
    const index = createIndex([
      doc('deploy', { name: 'deploy-check', description: 'Check a branch before deploy' }),
      doc('review', { name: 'code-review', description: 'Review pull requests for correctness', tags: ['review'] }),
      doc('skill', { name: 'skill-writer', description: 'Write a new skill' }),
    ]);
    expect(ids(search(index, 'I need a skill for reviewing pull requests'))[0]).toBe('review');
  });

  it('an empty or filler-only query means "no query"', () => {
    const index = createIndex([doc('a', { name: 'x' })]);
    expect(search(index, '')).toBeNull();
    expect(search(index, 'I need a')).toBeNull();
  });

  it('treats regex and HTML characters as text', () => {
    const index = createIndex([doc('a', { name: 'alert' })]);
    expect(() => search(index, '.*(?<x>[')).not.toThrow();
    expect(ids(search(index, '<b>alert</b>'))).toEqual(['a']);
  });

  it('gives the same results after serializeIndex → loadIndex', () => {
    const docs = [doc('a', { name: 'security-audit' }), doc('b', { body: 'security notes' }), doc('c', { name: 'zebra' })];
    const original = createIndex(docs);
    const loaded = loadIndex(JSON.parse(JSON.stringify(serializeIndex(original))));
    for (const query of ['security', 'secuirty', 'zeb', 'nothing']) {
      expect(search(loaded, query)).toEqual(search(original, query));
    }
  });

  it('NFR: a query over 500 docs takes under 50 ms (median of 10)', () => {
    const words = ['review', 'security', 'deploy', 'spec', 'plan', 'test', 'lint', 'docs', 'agent', 'hook'];
    const docs = Array.from({ length: 500 }, (_, i) =>
      doc(`d${i}`, {
        name: `${words[i % 10]}-${i}`,
        description: `Helps with ${words[(i * 3) % 10]} and ${words[(i * 7) % 10]} work number ${i}`,
        tags: [words[(i * 5) % 10]!],
        plugin: `plugin-${i % 20}`,
        body: `${words.join(' ')} `.repeat(40),
      }),
    );
    const index = createIndex(docs);
    const times: number[] = [];
    for (let run = 0; run < 10; run += 1) {
      const start = performance.now();
      search(index, 'I need a securty review for deploying plans');
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[5]).toBeLessThan(50);
  });
});

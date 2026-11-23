import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/catalog/build-catalog.ts';
import { toSearchDocs } from '../src/catalog/publish.ts';
import { orderResults } from '../src/search/browse.ts';
import { createIndex, loadIndex, search, serializeIndex } from '../src/search/engine.ts';
import { fixturePath } from './helpers/fixture.ts';

// The full pipeline over the fixture: build → search docs → index → serialized → loaded.
const result = buildCatalog({
  root: fixturePath('marketplace'),
  repo: 'owner/repo',
  siteUrl: 'https://x.test/',
  buildInfo: { commit: 'd'.repeat(40), commitDate: '2026-11-20T10:00:00.000Z', builtAt: '2026-11-20T10:00:00.000Z' },
});
const index = loadIndex(JSON.parse(JSON.stringify(serializeIndex(createIndex(toSearchDocs(result.artifacts))))));
const run = (query: string) => orderResults(result.artifacts, search(index, query)).map((artifact) => artifact.id);

describe('search over the fixture marketplace', () => {
  it('AC-32: the example sentence ranks both code-review skills first', () => {
    const ids = run('I need a skill for reviewing pull requests');
    expect(ids.slice(0, 2).sort()).toEqual(['alpha:code-review', 'beta:code-review']);
  });

  it('AC-13: a transposition typo finds the security skill', () => {
    expect(run('secuirty')[0]).toBe('alpha:security-audit');
    expect(run('secur')).toContain('alpha:security-audit');
  });

  it('AC-11: a word only in a body is found', () => {
    expect(run('zebrafish')).toEqual(['beta:spec-writer']);
  });

  it('AC-12: body-only matches rank below name, description and tag matches', () => {
    const ids = run('security');
    const lastPrimary = Math.max(ids.indexOf('alpha:security-audit'), ids.indexOf('alpha'));
    expect(ids.indexOf('beta:spec-writer')).toBeGreaterThan(lastPrimary);
    expect(ids.indexOf('beta:planner')).toBeGreaterThan(lastPrimary);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { fixturePath } from '../../test/helpers/fixture.ts';
import { buildCatalog } from './build-catalog.ts';
import { toCatalogDocument, toLlmsTxt, toSearchDocs } from './publish.ts';

const siteUrl = 'https://example.github.io/agentic-engineering/';
const buildInfo = { commit: 'c'.repeat(40), commitDate: '2026-11-20T10:00:00.000Z', builtAt: '2026-11-23T10:00:00.000Z' };
const result = buildCatalog({ root: fixturePath('marketplace'), repo: 'owner/repo', siteUrl, buildInfo });
const document = toCatalogDocument(result, siteUrl);

// ajv-formats is CommonJS; its default export arrives wrapped under some loaders.
const addFormats = ((addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ??
  addFormatsModule) as typeof addFormatsModule;

describe('catalog.json (AC-30)', () => {
  it('validates against public/catalog.schema.json', () => {
    const schema = JSON.parse(readFileSync(resolve('public/catalog.schema.json'), 'utf8'));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(JSON.parse(JSON.stringify(document)));
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('carries the schema version, the commit and a detail URL per entry', () => {
    expect(document.schemaVersion).toBe(1);
    expect(document.commit).toBe('c'.repeat(40));
    expect(document.$schema).toBe(`${siteUrl}catalog.schema.json`);
    expect(document.entries).toHaveLength(13);
    for (const entry of document.entries) {
      expect(entry.detailUrl.startsWith(siteUrl)).toBe(true);
      expect(Object.keys(entry)).not.toContain('bodyHtml');
    }
  });

  it('search docs cut the body to 4,000 characters', () => {
    const docs = toSearchDocs(result.artifacts.map((a) => ({ ...a, bodyText: 'x'.repeat(5000) })));
    expect(docs.every((doc) => doc.body.length === 4000)).toBe(true);
    expect(docs[0]?.id).toBe('plugins/alpha/');
  });
});

describe('llms.txt (AC-31)', () => {
  const text = toLlmsTxt(document, siteUrl);

  it('describes the marketplace and links the JSON catalog', () => {
    expect(text.startsWith('# agentic-engineering\n\n> Fixture marketplace for the catalog site tests\n')).toBe(true);
    expect(text).toContain('`/plugin marketplace add owner/repo`');
    expect(text).toContain(`[catalog.json](${siteUrl}catalog.json)`);
  });

  it('lists each plugin with its components and detail URLs', () => {
    expect(text).toContain('## alpha');
    expect(text).toContain('## beta');
    expect(text).toContain(
      `- [code-review](${siteUrl}plugins/alpha/skills/code-review/): Review pull requests for correctness, readability and missing tests before they are merged. (skill)`,
    );
    expect(text).toContain(`- [hooks](${siteUrl}plugins/alpha/hooks/)`);
    expect(text).toContain(`- [docs-search](${siteUrl}plugins/alpha/mcp/docs-search/)`);
    const betaSection = text.slice(text.indexOf('## beta'));
    expect(betaSection).toContain(`- [planner](${siteUrl}plugins/beta/agents/planner/)`);
    expect(betaSection).not.toContain('plugins/alpha/');
  });
});

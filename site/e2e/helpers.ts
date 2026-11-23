import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CatalogDocument } from '../src/catalog/types.ts';

/** The catalog the e2e site was built with, read from disk. */
export function builtCatalog(): CatalogDocument {
  return JSON.parse(readFileSync(resolve('dist-e2e/catalog.json'), 'utf8')) as CatalogDocument;
}

/** The fixture's expected landing order. */
export function expectedEntries(): { id: string; type: string }[] {
  return JSON.parse(readFileSync(resolve('test/fixtures/marketplace.expected.json'), 'utf8'));
}

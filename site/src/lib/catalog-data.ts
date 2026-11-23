import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildCatalog } from '../catalog/build-catalog.ts';
import { readBuildInfo } from '../catalog/build-info.ts';
import { CatalogBuildError } from '../catalog/problems.ts';
import { toCatalogDocument, toLlmsTxt, toSearchDocs } from '../catalog/publish.ts';
import type { BuildResult, CatalogDocument } from '../catalog/types.ts';
import { createIndex, serializeIndex } from '../search/engine.ts';

/** Search data budget (NFR): catalog + index, gzipped. */
const SEARCH_DATA_BUDGET = 400 * 1024;
const DEFAULT_REPO = 'nazardrahusevych/agentic-engineering';

export interface SiteCatalog extends BuildResult {
  siteUrl: string;
  repo: string;
  document: CatalogDocument;
  catalogJson: string;
  searchIndexJson: string;
  llmsTxt: string;
}

let cached: SiteCatalog | undefined;

/** Absolute site URL with the base path and a trailing slash. */
export function siteUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return new URL(base, import.meta.env.SITE).href;
}

/**
 * Builds the catalog once per build process. The repository root is `CATALOG_ROOT` relative to `site/`
 * (the working directory), never derived from `import.meta.url`, which changes when Astro bundles pages.
 */
export function getCatalog(): SiteCatalog {
  if (cached) return cached;
  const root = resolve(process.cwd(), process.env.CATALOG_ROOT ?? '..');
  const repo = process.env.CATALOG_REPO || process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
  const url = siteUrl();
  const info = readBuildInfo(root, process.env);
  let result: BuildResult;
  try {
    result = buildCatalog({ root, repo, siteUrl: url, buildInfo: info.buildInfo });
  } catch (error) {
    if (error instanceof CatalogBuildError) console.error(error.message);
    throw error;
  }
  const warnings = [...info.warnings, ...result.warnings];
  const document = toCatalogDocument(result, url);
  const catalogJson = `${JSON.stringify(document, null, 2)}\n`;
  const searchIndexJson = JSON.stringify(serializeIndex(createIndex(toSearchDocs(result.artifacts))));
  const size = gzipSync(catalogJson).length + gzipSync(searchIndexJson).length;
  if (size > SEARCH_DATA_BUDGET) {
    warnings.push(
      `catalog.json + search-index.json are ${Math.round(size / 1024)} KB gzipped, over the ` +
        `${SEARCH_DATA_BUDGET / 1024} KB budget; lower BODY_INDEX_CHARS or split the index`,
    );
  }
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  cached = {
    ...result,
    warnings,
    siteUrl: url,
    repo,
    document,
    catalogJson,
    searchIndexJson,
    llmsTxt: toLlmsTxt(document, url),
  };
  return cached;
}

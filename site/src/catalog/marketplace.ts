import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { isSafeName } from './paths.ts';
import { ProblemError } from './problems.ts';

export const MARKETPLACE_PATH = '.claude-plugin/marketplace.json';

export interface MarketplaceEntry {
  name: string;
  source: unknown;
  description?: unknown;
  category?: unknown;
  tags?: unknown;
  version?: unknown;
  [key: string]: unknown;
}

export interface MarketplaceFile {
  name: string;
  description: string;
  owner: { name: string; url: string | null };
  pluginRoot: string | null;
  plugins: MarketplaceEntry[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads and parses a JSON file; missing or invalid files become a ProblemError for `relPath`. */
export function readJsonFile(root: string, relPath: string): unknown {
  const abs = join(root, relPath);
  if (!existsSync(abs)) throw new ProblemError(relPath, 'file not found');
  try {
    return JSON.parse(readFileSync(abs, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new ProblemError(relPath, `invalid JSON: ${(error as Error).message}`);
  }
}

/** Reads `.claude-plugin/marketplace.json`; any structural problem fails the build (AC-6). */
export function readMarketplace(root: string): MarketplaceFile {
  const data = readJsonFile(root, MARKETPLACE_PATH);
  if (!isRecord(data)) throw new ProblemError(MARKETPLACE_PATH, 'expected a JSON object');
  if (typeof data.name !== 'string' || !isSafeName(data.name)) {
    throw new ProblemError(MARKETPLACE_PATH, '"name" must be a URL- and filename-safe string');
  }
  if (!Array.isArray(data.plugins)) throw new ProblemError(MARKETPLACE_PATH, '"plugins" must be an array');
  const owner = isRecord(data.owner) ? data.owner : {};
  const metadata = isRecord(data.metadata) ? data.metadata : {};
  const description =
    typeof data.description === 'string'
      ? data.description
      : typeof metadata.description === 'string'
        ? metadata.description
        : '';
  const plugins: MarketplaceEntry[] = [];
  data.plugins.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      throw new ProblemError(MARKETPLACE_PATH, `plugins[${index}] must be an object with a "name"`);
    }
    if (!isSafeName(entry.name)) {
      throw new ProblemError(MARKETPLACE_PATH, `plugin name "${entry.name}" is not URL- and filename-safe`);
    }
    plugins.push(entry as MarketplaceEntry);
  });
  return {
    name: data.name,
    description,
    owner: {
      name: typeof owner.name === 'string' ? owner.name : '',
      url: typeof owner.url === 'string' && /^https?:\/\//.test(owner.url) ? owner.url : null,
    },
    pluginRoot: typeof metadata.pluginRoot === 'string' ? metadata.pluginRoot : null,
    plugins,
  };
}

export type ResolvedSource = { kind: 'local'; dir: string } | { kind: 'external' };

function cleanRelative(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Resolves a marketplace entry's source to a repository-relative plugin directory, with the same rules as
 * `scripts/lib/release-lib.mjs#locatePlugin`: `./` paths and bare names under `metadata.pluginRoot`; `..` is rejected.
 */
export function resolveSource(entry: MarketplaceEntry, pluginRoot: string | null): ResolvedSource {
  const { source } = entry;
  if (typeof source !== 'string') {
    if (isRecord(source)) return { kind: 'external' };
    throw new ProblemError(MARKETPLACE_PATH, `plugin "${entry.name}" has no "source"`);
  }
  let relative: string | null = null;
  if (source.startsWith('./')) relative = cleanRelative(source);
  else if (pluginRoot && !source.includes(':')) relative = posix.join(cleanRelative(pluginRoot), source);
  if (relative === null || relative.includes('\\') || relative.split('/').includes('..') || posix.isAbsolute(relative)) {
    throw new ProblemError(MARKETPLACE_PATH, `plugin "${entry.name}" has an unsupported source "${source}"`);
  }
  return { kind: 'local', dir: posix.normalize(relative || '.') };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Plugin directories under `plugins/` (and `pluginRoot`) that no marketplace entry points at (AC-5). */
export function findUnlistedPluginDirs(root: string, listedDirs: Set<string>, pluginRoot: string | null): string[] {
  const parents = new Set(['plugins']);
  if (pluginRoot) parents.add(posix.normalize(cleanRelative(pluginRoot)));
  const unlisted: string[] = [];
  for (const parent of parents) {
    const abs = join(root, parent);
    if (!isDirectory(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      const rel = posix.join(parent, name);
      if (name.startsWith('.') || !isDirectory(join(abs, name)) || listedDirs.has(rel)) continue;
      unlisted.push(rel);
    }
  }
  return unlisted;
}

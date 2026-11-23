import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { renderMarkdown } from './markdown.ts';
import { isRecord, readJsonFile, type MarketplaceEntry } from './marketplace.ts';
import { ProblemError, type CatalogProblem } from './problems.ts';

/** Per-build context shared by the readers; readers push problems instead of throwing so all are reported. */
export interface ReadContext {
  root: string;
  repo: string;
  commit: string;
  problems: CatalogProblem[];
  warnings: string[];
}

/** A config source: a repository-relative file path, or an inline object declared in `plugin.json`. */
export type ConfigSource = { path: string } | { inline: unknown; path: string };

export interface ComponentPaths {
  skills: string[];
  agents: string[];
  commands: string[];
  hooks: ConfigSource[];
  mcp: ConfigSource[];
}

export interface PluginManifest {
  name: string;
  /** Repository-relative plugin directory. */
  dir: string;
  version: string | null;
  description: string;
  license: string | null;
  author: { name: string; url: string | null } | null;
  keywords: string[];
  changelogHtml: string | null;
  otherComponents: string[];
  paths: ComponentPaths;
}

/** Component kinds Claude Code knows but the catalog gives no card (Non-goals). */
const OTHER_COMPONENTS = ['output-styles', 'workflows', 'themes', 'monitors', 'bin', '.lsp.json'];

export function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

/** Resolves a `plugin.json` component path (`./…`, inside the plugin) to a repository-relative path. */
function componentPath(dir: string, value: string, manifestPath: string): string {
  const clean = value.replace(/^\.\//, '');
  const normalized = posix.normalize(posix.join(dir, clean));
  if (
    value.includes('\\') ||
    posix.isAbsolute(clean) ||
    clean.split('/').includes('..') ||
    (dir !== '.' && !`${normalized}/`.startsWith(`${dir}/`))
  ) {
    throw new ProblemError(manifestPath, `component path "${value}" must stay inside the plugin`);
  }
  return normalized;
}

function configSources(dir: string, value: unknown, manifestPath: string): ConfigSource[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) =>
    typeof item === 'string'
      ? { path: componentPath(dir, item, manifestPath) }
      : { inline: item, path: manifestPath },
  );
}

/**
 * Reads a plugin's `plugin.json` (or falls back to its marketplace entry with a warning), its changelog and its
 * component locations: defaults plus the manifest overrides.
 */
export function readPlugin(ctx: ReadContext, entry: MarketplaceEntry, dir: string): PluginManifest {
  const manifestPath = posix.join(dir, '.claude-plugin/plugin.json');
  let manifest: Record<string, unknown>;
  if (existsSync(join(ctx.root, manifestPath))) {
    const data = readJsonFile(ctx.root, manifestPath);
    if (!isRecord(data)) throw new ProblemError(manifestPath, 'expected a JSON object');
    manifest = data;
  } else {
    ctx.warnings.push(`${manifestPath} not found; the marketplace entry of "${entry.name}" is used as its manifest`);
    manifest = entry;
  }

  const authorValue = manifest.author;
  const author =
    isRecord(authorValue) && typeof authorValue.name === 'string'
      ? {
          name: authorValue.name,
          url: typeof authorValue.url === 'string' && /^https?:\/\//.test(authorValue.url) ? authorValue.url : null,
        }
      : typeof authorValue === 'string'
        ? { name: authorValue, url: null }
        : null;

  const changelogRel = posix.join(dir, 'CHANGELOG.md');
  const changelogAbs = join(ctx.root, changelogRel);
  const changelogHtml = existsSync(changelogAbs)
    ? renderMarkdown(readFileSync(changelogAbs, 'utf8'), { repo: ctx.repo, commit: ctx.commit, fileDir: dir })
    : null;

  const at = (rel: string) => posix.join(dir, rel);
  const optionalFile = (rel: string): ConfigSource[] => (exists(join(ctx.root, at(rel))) ? [{ path: at(rel) }] : []);
  const paths: ComponentPaths = {
    skills: [at('skills'), ...strings(manifest.skills).map((value) => componentPath(dir, value, manifestPath))],
    agents:
      manifest.agents === undefined
        ? [at('agents')]
        : strings(manifest.agents).map((value) => componentPath(dir, value, manifestPath)),
    commands:
      manifest.commands === undefined
        ? [at('commands')]
        : strings(manifest.commands).map((value) => componentPath(dir, value, manifestPath)),
    hooks: [
      ...optionalFile('hooks/hooks.json'),
      ...(manifest.hooks === undefined ? [] : configSources(dir, manifest.hooks, manifestPath)),
    ],
    mcp: [
      ...optionalFile('.mcp.json'),
      ...(manifest.mcpServers === undefined ? [] : configSources(dir, manifest.mcpServers, manifestPath)),
    ],
  };
  // A manifest path that repeats the default would be read twice.
  paths.hooks = dedupeSources(paths.hooks);
  paths.mcp = dedupeSources(paths.mcp);
  paths.skills = [...new Set(paths.skills)];

  const description =
    typeof entry.description === 'string'
      ? entry.description
      : typeof manifest.description === 'string'
        ? manifest.description
        : '';

  return {
    name: entry.name,
    dir,
    version: typeof manifest.version === 'string' ? manifest.version : typeof entry.version === 'string' ? entry.version : null,
    description,
    license: typeof manifest.license === 'string' ? manifest.license : null,
    author,
    keywords: strings(manifest.keywords),
    changelogHtml,
    otherComponents: OTHER_COMPONENTS.filter((name) => exists(join(ctx.root, at(name)))),
    paths,
  };
}

function dedupeSources(sources: ConfigSource[]): ConfigSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if ('inline' in source) return true;
    if (seen.has(source.path)) return false;
    seen.add(source.path);
    return true;
  });
}

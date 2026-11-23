import { posix } from 'node:path';
import { readComponents, listFiles, MAX_FILES_PER_PLUGIN, type ComponentDraft, type FileBudget } from './components.ts';
import { markdownToText, renderMarkdown } from './markdown.ts';
import {
  findUnlistedPluginDirs,
  MARKETPLACE_PATH,
  readMarketplace,
  resolveSource,
  type MarketplaceEntry,
  type MarketplaceFile,
} from './marketplace.ts';
import { compareText, detailPath, sourceUrl, TYPE_ORDER } from './paths.ts';
import { readPlugin, type ReadContext } from './plugin.ts';
import { CatalogBuildError, ProblemError, type CatalogProblem } from './problems.ts';
import type { Artifact, BuildCatalogOptions, BuildResult, MarketplaceInfo } from './types.ts';

function normalizeTags(...lists: unknown[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const tag of list) {
      if (typeof tag !== 'string') continue;
      const clean = tag.trim().toLowerCase();
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

/** Landing order (AC-15): type, then name, then plugin. T6 replaces it with search/browse.ts#landingCompare. */
function landingCompare(a: Artifact, b: Artifact): number {
  return (
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || compareText(a.name, b.name) || compareText(a.plugin, b.plugin)
  );
}

function toMarketplaceInfo(file: MarketplaceFile, repo: string): MarketplaceInfo {
  return {
    name: file.name,
    description: file.description,
    owner: file.owner,
    addCommand: `/plugin marketplace add ${repo}`,
    url: `https://github.com/${repo}`,
  };
}

interface PluginContext {
  name: string;
  version: string | null;
  tags: string[];
  category: string | null;
  install: string;
}

/**
 * Builds the catalog from a marketplace repository (AC-3 – AC-6). Every problem is collected first; if there is
 * any, one CatalogBuildError lists them all with their paths.
 */
export function buildCatalog(options: BuildCatalogOptions): BuildResult {
  const { root, repo, siteUrl, buildInfo } = options;
  const { commit } = buildInfo;
  const problems: CatalogProblem[] = [];
  const warnings: string[] = [];
  const ctx: ReadContext = { root, repo, commit, problems, warnings };

  let marketplace: MarketplaceFile;
  try {
    marketplace = readMarketplace(root);
  } catch (error) {
    if (error instanceof ProblemError) throw new CatalogBuildError([error.problem]);
    throw error;
  }

  const artifacts: Artifact[] = [];
  const listedDirs = new Set<string>();
  const seenPlugins = new Set<string>();
  const url = (path: string) => `${siteUrl}${path}`;

  const makeArtifact = (
    plugin: PluginContext,
    fields: Pick<Artifact, 'type' | 'name' | 'description' | 'path' | 'bodyHtml' | 'bodyText'> & {
      isDir: boolean;
      tags: string[];
      files: string[];
    },
  ): Artifact => {
    const path = detailPath(fields.type, plugin.name, fields.name);
    return {
      id: fields.type === 'plugin' ? plugin.name : `${plugin.name}:${fields.name}`,
      type: fields.type,
      name: fields.name,
      plugin: plugin.name,
      pluginVersion: plugin.version,
      description: fields.description,
      tags: fields.tags,
      category: plugin.category,
      path: fields.path,
      sourceUrl: sourceUrl(repo, commit, fields.path, fields.isDir),
      detailUrl: url(path),
      install: plugin.install,
      detailPath: path,
      bodyHtml: fields.bodyHtml,
      bodyText: fields.bodyText,
      files: fields.files.map((file) => ({ path: file, url: sourceUrl(repo, commit, file, false) })),
    };
  };

  for (const entry of marketplace.plugins) {
    if (seenPlugins.has(entry.name)) {
      problems.push({ path: MARKETPLACE_PATH, reason: `plugin "${entry.name}" is listed twice` });
      continue;
    }
    seenPlugins.add(entry.name);
    readOnePlugin(entry);
  }

  function readOnePlugin(entry: MarketplaceEntry): void {
    const category = typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null;
    const install = `/plugin install ${entry.name}@${marketplace.name}`;
    let source;
    try {
      source = resolveSource(entry, marketplace.pluginRoot);
    } catch (error) {
      if (error instanceof ProblemError) return void problems.push(error.problem);
      throw error;
    }
    if (source.kind === 'external') {
      warnings.push(`plugin "${entry.name}" has an external source; only its marketplace entry is listed`);
      const plugin: PluginContext = {
        name: entry.name,
        version: typeof entry.version === 'string' ? entry.version : null,
        tags: normalizeTags(entry.tags),
        category,
        install,
      };
      artifacts.push({
        ...makeArtifact(plugin, {
          type: 'plugin',
          name: entry.name,
          description: typeof entry.description === 'string' ? entry.description : '',
          path: MARKETPLACE_PATH,
          isDir: false,
          tags: plugin.tags,
          files: [],
          bodyHtml: null,
          bodyText: '',
        }),
        pluginInfo: { license: null, author: null, changelogHtml: null, otherComponents: [] },
      });
      return;
    }

    listedDirs.add(source.dir);
    const pluginDir = source.dir;
    let manifest;
    try {
      manifest = readPlugin(ctx, entry, pluginDir);
    } catch (error) {
      if (error instanceof ProblemError) return void problems.push(error.problem);
      throw error;
    }
    const plugin: PluginContext = {
      name: entry.name,
      version: manifest.version,
      tags: normalizeTags(entry.tags, manifest.keywords),
      category,
      install,
    };
    const pluginBudget: FileBudget = { remaining: MAX_FILES_PER_PLUGIN, truncated: false };
    const componentBudget: FileBudget = { remaining: MAX_FILES_PER_PLUGIN, truncated: false };
    const drafts = readComponents(ctx, manifest, componentBudget);
    const pluginFiles = listFiles(root, pluginDir, pluginBudget);
    if (pluginBudget.truncated || componentBudget.truncated) {
      warnings.push(`plugin "${entry.name}" has more than ${MAX_FILES_PER_PLUGIN} files; file lists are truncated`);
    }

    artifacts.push({
      ...makeArtifact(plugin, {
        type: 'plugin',
        name: entry.name,
        description: manifest.description,
        path: pluginDir,
        isDir: true,
        tags: plugin.tags,
        files: pluginFiles,
        bodyHtml: null,
        bodyText: '',
      }),
      pluginInfo: {
        license: manifest.license,
        author: manifest.author,
        changelogHtml: manifest.changelogHtml,
        otherComponents: manifest.otherComponents,
      },
    });

    const ids = new Map<string, string>();
    for (const draft of drafts) {
      const artifact = componentArtifact(plugin, draft);
      const previous = ids.get(artifact.id);
      if (previous) warnings.push(`id "${artifact.id}" is used by both a ${previous} and a ${draft.type}`);
      ids.set(artifact.id, draft.type);
      artifacts.push(artifact);
    }
  }

  function componentArtifact(plugin: PluginContext, draft: ComponentDraft): Artifact {
    const fileDir = draft.isDir ? draft.path : posix.dirname(draft.path);
    const artifact = makeArtifact(plugin, {
      type: draft.type,
      name: draft.name,
      description: draft.description,
      path: draft.path,
      isDir: draft.isDir,
      tags: draft.tags ? normalizeTags(draft.tags) : plugin.tags,
      files: draft.files,
      bodyHtml: draft.markdown === null ? null : renderMarkdown(draft.markdown, { repo, commit, fileDir }),
      bodyText: draft.markdown === null ? draft.text : markdownToText(draft.markdown),
    });
    if (draft.hooks) artifact.hooks = draft.hooks;
    if (draft.mcp) artifact.mcp = draft.mcp;
    return artifact;
  }

  for (const dir of findUnlistedPluginDirs(root, listedDirs, marketplace.pluginRoot)) {
    warnings.push(`${dir} is not listed in ${MARKETPLACE_PATH}; skipped`);
  }

  if (problems.length > 0) throw new CatalogBuildError(problems);
  artifacts.sort(landingCompare);
  return { marketplace: toMarketplaceInfo(marketplace, repo), artifacts, warnings, buildInfo };
}

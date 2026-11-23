import type { BuildInfo } from './build-info.ts';

export type { BuildInfo } from './build-info.ts';

export type ArtifactType = 'plugin' | 'skill' | 'agent' | 'command' | 'workflow' | 'hooks' | 'mcp';

/** One public catalog entry (AC-4, AC-30). */
export interface CatalogEntry {
  /** `<plugin>` for plugins, `<plugin>:<name>` for components, `<plugin>:hooks` for the hooks entry. */
  id: string;
  type: ArtifactType;
  name: string;
  plugin: string;
  pluginVersion: string | null;
  description: string;
  tags: string[];
  category: string | null;
  /** Path in the repository, forward slashes. */
  path: string;
  sourceUrl: string;
  /** Absolute URL of the detail page. */
  detailUrl: string;
  /** `/plugin install <plugin>@<marketplace>`. */
  install: string;
  /** Plugins this plugin depends on (`name` or `name@marketplace`); empty for components. */
  dependencies: string[];
}

export interface MarketplaceInfo {
  name: string;
  description: string;
  owner: { name: string; url: string | null };
  /** `/plugin marketplace add <owner>/<repo>`. */
  addCommand: string;
  /** GitHub URL of the repository. */
  url: string;
}

/** The published `catalog.json` (AC-30). */
export interface CatalogDocument {
  $schema: string;
  schemaVersion: 1;
  marketplace: MarketplaceInfo;
  commit: string;
  commitDate: string;
  builtAt: string;
  entries: CatalogEntry[];
}

export interface RepoFile {
  path: string;
  url: string;
}

export interface HookRow {
  event: string;
  matcher: string | null;
  type: string;
  command: string | null;
}

export interface McpServerInfo {
  name: string;
  transport: string;
  command: string | null;
  args: string[];
  url: string | null;
}

export interface WorkflowInfo {
  phases: string[];
  /** The command that runs it: `/<plugin>:<name>`. */
  command: string;
  /** The workflow source, shown as text only. */
  source: string;
}

export interface PluginInfo {
  license: string | null;
  author: { name: string; url: string | null } | null;
  changelogHtml: string | null;
  /** Component kinds without cards that the plugin contains (e.g. `output-styles`). */
  otherComponents: string[];
}

/** Build-time model of one artifact: the catalog entry plus what its detail page needs. */
export interface Artifact extends CatalogEntry {
  /** Detail page path relative to the site base, with a trailing slash. */
  detailPath: string;
  /** Sanitized HTML of the markdown body, or null for types without a markdown body. */
  bodyHtml: string | null;
  /** Plain text of the body, for search. */
  bodyText: string;
  files: RepoFile[];
  hooks?: HookRow[];
  mcp?: McpServerInfo;
  workflow?: WorkflowInfo;
  pluginInfo?: PluginInfo;
}

export interface BuildResult {
  marketplace: MarketplaceInfo;
  artifacts: Artifact[];
  warnings: string[];
  buildInfo: BuildInfo;
}

export interface BuildCatalogOptions {
  /** Absolute path of the marketplace root (the directory holding `.claude-plugin/`). */
  root: string;
  /** `owner/name` of the GitHub repository. */
  repo: string;
  /** Absolute site URL with the base path and a trailing slash. */
  siteUrl: string;
  buildInfo: BuildInfo;
}

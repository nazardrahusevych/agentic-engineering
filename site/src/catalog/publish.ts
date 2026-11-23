import { BODY_INDEX_CHARS } from '../search/engine.ts';
import type { SearchDoc } from '../search/types.ts';
import type { Artifact, BuildResult, CatalogDocument, CatalogEntry } from './types.ts';

/** The public part of an artifact (AC-4, AC-30): no bodies, no file lists. */
export function toCatalogEntry(artifact: Artifact): CatalogEntry {
  return {
    id: artifact.id,
    type: artifact.type,
    name: artifact.name,
    plugin: artifact.plugin,
    pluginVersion: artifact.pluginVersion,
    description: artifact.description,
    tags: artifact.tags,
    category: artifact.category,
    path: artifact.path,
    sourceUrl: artifact.sourceUrl,
    detailUrl: artifact.detailUrl,
    install: artifact.install,
  };
}

/** `catalog.json` (AC-30). Entries keep the landing order of the build. */
export function toCatalogDocument(result: BuildResult, siteUrl: string): CatalogDocument {
  return {
    $schema: `${siteUrl}catalog.schema.json`,
    schemaVersion: 1,
    marketplace: result.marketplace,
    commit: result.buildInfo.commit,
    commitDate: result.buildInfo.commitDate,
    builtAt: result.buildInfo.builtAt,
    entries: result.artifacts.map(toCatalogEntry),
  };
}

/** Documents for the search index; the body is cut to BODY_INDEX_CHARS. */
export function toSearchDocs(artifacts: Artifact[]): SearchDoc[] {
  return artifacts.map((artifact) => ({
    id: artifact.detailPath,
    name: artifact.name,
    description: artifact.description,
    tags: artifact.tags,
    plugin: artifact.plugin,
    body: artifact.bodyText.slice(0, BODY_INDEX_CHARS),
  }));
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** `llms.txt` in the llmstxt.org layout (AC-31). */
export function toLlmsTxt(document: CatalogDocument, siteUrl: string): string {
  const { marketplace } = document;
  const lines = [
    `# ${marketplace.name}`,
    '',
    `> ${oneLine(marketplace.description) || 'A Claude Code plugin marketplace.'}`,
    '',
    `Add the marketplace in Claude Code with \`${marketplace.addCommand}\`, then install a plugin with ` +
      `\`/plugin install <plugin>@${marketplace.name}\`. Source: ${marketplace.url}`,
    '',
    `- [catalog.json](${siteUrl}catalog.json): every plugin and component as JSON ` +
      `(schema: ${siteUrl}catalog.schema.json), built from commit ${document.commit}`,
  ];
  const plugins = document.entries.filter((entry) => entry.type === 'plugin');
  if (plugins.length === 0) {
    lines.push('', 'The marketplace has no plugins yet.');
  }
  for (const plugin of plugins) {
    lines.push('', `## ${plugin.name}`, '');
    const members = document.entries.filter((entry) => entry.plugin === plugin.plugin);
    for (const entry of members) {
      const description = oneLine(entry.description);
      lines.push(`- [${entry.name}](${entry.detailUrl}): ${description ? `${description} ` : ''}(${entry.type})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

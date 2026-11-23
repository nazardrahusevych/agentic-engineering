/**
 * Every user-visible UI string of the catalog site (SPEC-3 AC-2, AC-3). Components and pages read text only from
 * here; strings with values are functions. Data from the catalog (names, descriptions, commands) is not UI text.
 */
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export const en = {
  site: {
    name: 'agentic-engineering',
    tagline: 'Claude Code plugin catalog',
    skipLink: 'Skip to content',
    noscript: 'JavaScript is required to search the catalog. Every artifact still has its own page.',
    catalogJsonTitle: 'Catalog (JSON)',
    pageTitle: (page: string) => `${page} — agentic-engineering`,
  },
  footer: {
    builtFrom: 'Built from',
    catalogJson: 'catalog.json',
    llmsTxt: 'llms.txt',
    source: 'Source on GitHub',
  },
  landing: {
    title: (marketplace: string) => `${marketplace} — Claude Code plugin catalog`,
    description: (marketplace: string) =>
      `Search every skill, agent, command, workflow, hook and MCP server of the ${marketplace} marketplace.`,
    fallbackDescription: 'Claude Code plugins.',
    lead: 'Search the skills, agents, commands, workflows, hooks and MCP servers inside every plugin, then copy the install command.',
    addMarketplace: 'Add the marketplace in Claude Code first:',
    copy: 'Copy',
    copyContext: 'marketplace add command',
  },
  search: {
    label: 'Search the catalog',
    placeholder: 'e.g. a skill for reviewing pull requests',
    hintBefore: 'Press',
    hintKey: '/',
    hintAfter: 'to search from anywhere on the page.',
    resultsHeading: 'Results',
    count: (count: number) => plural(count, 'artifact', 'artifacts'),
    loading: 'Loading the catalog…',
    loadError: 'The catalog could not be loaded. Reload the page to try again.',
  },
  filters: {
    heading: 'Filters',
    legend: { type: 'Type', plugin: 'Plugin', category: 'Category', tag: 'Tag' },
    none: 'None',
    count: (count: number) => `(${count})`,
  },
  empty: {
    catalogEmptyTitle: 'The marketplace has no plugins yet.',
    catalogEmptyText: 'Tell us what you would like to see.',
    noMatchTitle: 'Nothing matches.',
    noMatchText: (hasFilters: boolean) => `Try other words${hasFilters ? ' or fewer filters' : ''}, or ask for it.`,
    clearFilters: 'Clear filters',
    requestIt: 'Request it',
  },
  card: {
    inPlugin: 'in',
    tags: 'Tags',
    copyInstall: 'Copy install',
    copyInstallContext: (plugin: string) => `for ${plugin}`,
  },
  copy: {
    copied: 'Copied',
    manualHint: 'Press Ctrl+C / ⌘C to copy',
    fieldLabel: (label: string) => `${label}: command to copy`,
  },
  detail: {
    pageTitle: (name: string, type: string, plugin: string) =>
      type === 'plugin' ? `${name} (plugin) — agentic-engineering` : `${name} (${type} in ${plugin}) — agentic-engineering`,
    inPlugin: 'in',
    version: (version: string) => `v${version}`,
    installHeading: 'Install',
    copy: 'Copy',
    copyContext: 'install command',
    viewSource: 'View the source on GitHub',
    pluginHeading: 'Plugin',
    facts: {
      version: 'Version',
      license: 'License',
      author: 'Author',
      category: 'Category',
      tags: 'Tags',
      alsoContains: 'Also contains',
      notSet: 'not set',
    },
    relationsHeading: 'Plugin dependencies',
    dependsOn: 'Depends on',
    usedBy: 'Used by',
    noDependencies: 'No other plugins.',
    notInMarketplace: '(not in this marketplace)',
    contentHeading: 'Content',
    hooksHeading: 'Hooks',
    hooksCaption: 'Hook events and matchers',
    hooksColumns: { event: 'Event', matcher: 'Matcher', type: 'Type', command: 'Command' },
    hooksAllMatchers: 'all',
    hooksNoCommand: '—',
    mcpHeading: 'MCP server',
    mcpFacts: { name: 'Name', transport: 'Transport', command: 'Command', url: 'URL' },
    workflowHeading: 'Workflow',
    workflowFacts: { run: 'Run with', phases: 'Phases' },
    workflowSource: 'Source',
    changelogHeading: 'Changelog',
    filesHeading: 'Files',
    siblingsHeading: (plugin: string) => `Other artifacts in ${plugin}`,
    noSiblings: 'None.',
  },
  notFound: {
    title: 'Not found — agentic-engineering',
    description: 'This page is not in the catalog.',
    heading: 'Not found',
    lead: 'This artifact is not in the catalog. It may have been renamed or removed. Search for it instead:',
    searchLabel: 'Search',
    searchButton: 'Search',
    browseAll: 'Browse the whole catalog',
  },
} as const;

export type Messages = typeof en;

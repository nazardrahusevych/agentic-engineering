# Catalog site

The catalog site lists every plugin of this marketplace and every skill, agent, command, workflow, hooks
configuration and MCP server inside them, with keyword search, filters, a detail page per artifact, plugin
dependencies, a machine-readable catalog and `llms.txt`. It is a static site on GitHub Pages:
<https://nazardrahusevych.github.io/agentic-engineering/>.
Specs: [`specs/feat-1-catalog-site.md`](../specs/feat-1-catalog-site.md),
[`specs/feat-3-site-react.md`](../specs/feat-3-site-react.md).

The site lives in [`site/`](../site/), a separate npm package with its own lockfile, so the repository root stays
dependency-free (`npm run release`, `npm run validate` and the root `npm test` need no install). It is built with
Astro: every page is static HTML, and the interactive parts (search, filters, copy buttons) are React components
hydrated in the browser.

## How indexing works

There is no index to maintain by hand. Every build reads the repository as it is at that commit and generates the
catalog, the search index and every page from it:

1. Add or change a plugin, skill, agent, command or workflow under `plugins/` (a new plugin also needs its entry in
   `.claude-plugin/marketplace.json`).
2. Open a pull request: the **Site** checks build the catalog from the branch and fail with the file and reason if
   something cannot be read; the **Validate** check runs the plugin rules (`npm run validate`).
3. Merge to `main`: the **Site** workflow rebuilds everything in GitHub Actions and deploys it to GitHub Pages.

The browser never reads the repository or the GitHub API: it loads the generated `catalog.json` and
`search-index.json` once and searches locally.

## What the build reads

Everything comes from the repository at the commit being built; nothing is fetched at runtime.

| Input | Used for |
|---|---|
| `.claude-plugin/marketplace.json` | the plugins (only listed ones), their category and tags, the marketplace name |
| `<plugin>/.claude-plugin/plugin.json` | version, license, author, keywords, `dependencies`, component path overrides |
| `<plugin>/skills/<name>/SKILL.md` | skill cards (name defaults to the directory name) |
| `<plugin>/agents/*.md`, `<plugin>/commands/*.md` | agent and command cards (top level only) |
| `<plugin>/workflows/*.js` (or `plugin.json` `workflows`) | workflow cards, named and described by `export const meta = { name, description, phases }`; the file is read as text and never executed |
| `<plugin>/hooks/hooks.json` (and `plugin.json` `hooks`) | one hooks card per plugin with every event and matcher |
| `<plugin>/.mcp.json` (and `plugin.json` `mcpServers`) | one card per MCP server |
| `<plugin>/CHANGELOG.md` | the changelog on the plugin page |
| git `HEAD` | the commit and date in the footer and in `catalog.json` |

Output styles, LSP servers, themes and monitors get no card; they appear by name in the plugin's file list and under
"Also contains". Plugin pages show **Depends on** and **Used by**; a dependency outside this marketplace is shown as
text (and warned about at build time when it is not written as `name@marketplace`).

### Warnings and failures

- **Warning** (the build continues): a directory under `plugins/` that `marketplace.json` does not list is skipped
  (`plugins/x is not listed in .claude-plugin/marketplace.json; skipped`); a plugin without `plugin.json`; a plugin
  with an external source (only its marketplace entry is listed); two components of one plugin with the same id
  (e.g. a skill and an agent both named `review`); a dependency that is not in the marketplace; search data over
  the 400 KB gzip budget.
- **Failure** (the build stops and prints every problem as `path: reason`): invalid JSON in `marketplace.json`,
  `plugin.json`, `hooks.json` or `.mcp.json`; invalid YAML frontmatter (with the line); a hooks or MCP
  configuration of the wrong shape; a skill or agent without `description`; a name that is not URL- and
  filename-safe; two components of the same type and name in one plugin.

A failed build on `main` never deploys, so the previous site stays live.

## Authoring conventions

- Every skill and agent needs a `description` in its frontmatter. Put the words people would search for first.
- A command's description is its frontmatter `description`, or else its first non-empty line.
- Names (plugin, skill directory or `name`, agent and command file names, MCP server names) must match
  `^[A-Za-z0-9][A-Za-z0-9._-]*$`: they become URL path segments and file names.
- Tags: a component uses frontmatter `metadata.tags` (a list) when present, otherwise its plugin's tags
  (marketplace entry `tags` plus `plugin.json` `keywords`). `metadata` is used because claude.ai accepts only a
  fixed set of top-level skill keys.
- The category is the plugin's marketplace `category`.
- Markdown is rendered sanitized: raw HTML is dropped, images become links, only `http(s)` and
  repository-relative links are kept (relative links point to GitHub at the built commit).

## Local commands

From the repository root, `npm run site:dev` starts the dev server for the real marketplace (after `npm ci` in
`site/`). Inside `site/`:

```sh
cd site
npm ci
npm run dev        # dev server at http://localhost:4321/agentic-engineering/, reloads on changes
npm run build      # static site in site/dist
npm run typecheck  # astro check (TypeScript)
npm test           # Vitest unit and integration tests
npm run test:e2e   # builds the fixture site into dist-e2e and runs Playwright (Chromium)
```

`npx playwright install chromium` is needed once before the first e2e run.

| Variable | Default | Purpose |
|---|---|---|
| `CATALOG_ROOT` | `..` (relative to `site/`) | Marketplace root to build from; the e2e build uses `test/fixtures/marketplace` |
| `CATALOG_REPO` | `GITHUB_REPOSITORY`, else `nazardrahusevych/agentic-engineering` | Repository for source and issue links |
| `CATALOG_COMMIT`, `CATALOG_COMMIT_DATE` | git `HEAD` | Override the build commit and date (tests) |

## Published files

| URL | Content |
|---|---|
| `/agentic-engineering/` | landing page: add-marketplace command, search, filters, cards |
| `/agentic-engineering/plugins/<plugin>/` | plugin page |
| `/agentic-engineering/plugins/<plugin>/{skills,agents,commands,mcp}/<name>/` | component pages |
| `/agentic-engineering/plugins/<plugin>/hooks/` | the plugin's hooks |
| `/agentic-engineering/catalog.json` | every entry as JSON, `schemaVersion: 1` |
| `/agentic-engineering/catalog.schema.json` | JSON Schema (2020-12) of `catalog.json` |
| `/agentic-engineering/search-index.json` | prebuilt MiniSearch index (kept apart from the catalog for phase 2) |
| `/agentic-engineering/llms.txt` | the marketplace for coding agents, in the llmstxt.org layout |

Search, filters and URLs work in the browser on these files only; the query never leaves the page. The search
URL format is `?q=…&type=skill&type=agent&plugin=…&category=…&tag=…`.

## UI text

Every user-visible string of the UI lives in [`site/src/i18n/en.ts`](../site/src/i18n/en.ts); strings with values
are functions there. Components and pages contain no literal text — `site/test/i18n.test.ts` fails when one does.
Names, descriptions and commands shown on the pages come from the catalog, not from this file.

## Deploying and rolling back

The [`Site` workflow](../.github/workflows/pages.yml) runs four jobs, each its own check in GitHub:

| Job | Does | Runs on |
|---|---|---|
| `Site / typecheck and unit tests` | `npm run typecheck`, `npm test` | every PR, push to `main`, manual run |
| `Site / build` | `npm run build`; uploads `site/dist` as the Pages artifact (not for PRs) | same |
| `Site / end-to-end tests` | Playwright against the fixture build | same |
| `Site / deploy` | deploys the artifact; needs the three jobs above | push to `main`, manual run |

The plugin rules run separately in the [`Validate` workflow](../.github/workflows/validate.yml).

To roll the site back, or deploy any other ref: **Actions → Site → Run workflow**, keep **Use workflow from:
main**, and set **ref** to a tag, branch or commit SHA. The `github-pages` environment only accepts runs from the
default branch, which is why the ref is an input. Only refs that already contain `site/` can be built; an older
ref fails the build and the live site stays as it is.

## One-time setup and manual checks

1. Settings → Pages → Source: **GitHub Actions**.
2. Create the `request` label (Issues → Labels).
3. After the first merge to `main`, the footer of the live site shows the merge commit (AC-1).
4. A pull request shows the "Site" checks (typecheck and unit tests, build, end-to-end tests) and "Validate", and the live site is unchanged (AC-2).
5. Break the frontmatter of a skill on a branch: the check fails with the file path. On `main`, a failed run
   leaves the live footer on the previous commit (AC-7).
6. Run the workflow with an older tag or SHA as `ref`: the footer shows that commit (AC-8).
7. Search for something missing on the live site and follow "Request it": the issue form opens pre-filled and
   labelled `request` (AC-17).

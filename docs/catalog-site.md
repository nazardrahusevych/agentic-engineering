# Catalog site

The catalog site lists every plugin of this marketplace and every skill, agent, command, hooks configuration and
MCP server inside them, with keyword search, filters, a detail page per artifact, a machine-readable catalog and
`llms.txt`. It is a static site on GitHub Pages: <https://nazardrahusevych.github.io/agentic-engineering/>.
Spec: [`specs/feat-1-catalog-site.md`](../specs/feat-1-catalog-site.md).

The site lives in [`site/`](../site/), a separate npm package with its own lockfile, so the repository root stays
dependency-free (`npm run release` and the root `npm test` need no install).

## What the build reads

Everything comes from the repository at the commit being built; nothing is fetched at runtime.

| Input | Used for |
|---|---|
| `.claude-plugin/marketplace.json` | the plugins (only listed ones), their category and tags, the marketplace name |
| `<plugin>/.claude-plugin/plugin.json` | version, license, author, keywords, component path overrides |
| `<plugin>/skills/<name>/SKILL.md` | skill cards (name defaults to the directory name) |
| `<plugin>/agents/*.md`, `<plugin>/commands/*.md` | agent and command cards (top level only) |
| `<plugin>/hooks/hooks.json` (and `plugin.json` `hooks`) | one hooks card per plugin with every event and matcher |
| `<plugin>/.mcp.json` (and `plugin.json` `mcpServers`) | one card per MCP server |
| `<plugin>/CHANGELOG.md` | the changelog on the plugin page |
| git `HEAD` | the commit and date in the footer and in `catalog.json` |

Output styles, LSP servers, themes, monitors and workflows get no card; they appear by name in the plugin's file
list and under "Also contains".

### Warnings and failures

- **Warning** (the build continues): a directory under `plugins/` that `marketplace.json` does not list is skipped
  (`plugins/x is not listed in .claude-plugin/marketplace.json; skipped`); a plugin without `plugin.json`; a plugin
  with an external source (only its marketplace entry is listed); two components of one plugin with the same id
  (e.g. a skill and an agent both named `review`); search data over the 400 KB gzip budget.
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

```sh
cd site
npm ci
npm run dev        # dev server at http://localhost:4321/agentic-engineering/
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

## Deploying and rolling back

The [`Pages` workflow](../.github/workflows/pages.yml) builds, tests and deploys on every push to `main`, and
runs the same build and tests (without deploying) on every pull request.

To roll the site back, or deploy any other ref: **Actions → Pages → Run workflow**, keep **Use workflow from:
main**, and set **ref** to a tag, branch or commit SHA. The `github-pages` environment only accepts runs from the
default branch, which is why the ref is an input. Only refs that already contain `site/` can be built; an older
ref fails the build and the live site stays as it is.

## One-time setup and manual checks

1. Settings → Pages → Source: **GitHub Actions**.
2. Create the `request` label (Issues → Labels).
3. After the first merge to `main`, the footer of the live site shows the merge commit (AC-1).
4. A pull request shows the "Pages / build" check, and the live site is unchanged (AC-2).
5. Break the frontmatter of a skill on a branch: the check fails with the file path. On `main`, a failed run
   leaves the live footer on the previous commit (AC-7).
6. Run the workflow with an older tag or SHA as `ref`: the footer shows that commit (AC-8).
7. Search for something missing on the live site and follow "Request it": the issue form opens pre-filled and
   labelled `request` (AC-17).

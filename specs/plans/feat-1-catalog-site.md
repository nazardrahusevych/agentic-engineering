# Plan — Feature 1: Catalog site (MVP)

Spec: `specs/feat-1-catalog-site.md` (SPEC-1) · Research: `specs/research/feat-1-catalog-site.md` ·
Base branch: `feat/1-catalog-site` · Mode: single-agent · Status: draft

## Goal
Publish a static catalog site on GitHub Pages (`https://nazardrahusevych.github.io/agentic-engineering/`). At build time it reads the marketplace from the repository and produces a card for every plugin, skill, agent, command, hooks configuration and MCP server. It adds client-side keyword search, filters, shareable URLs, a detail page per artifact, a machine-readable `catalog.json` and `llms.txt`. The site rebuilds on every push to `main`, runs as a check on pull requests, and can be redeployed from any earlier ref to roll it back.

## Spec feedback
These are notes for the user and spec-creator. None of them blocks the plan, and each has a default the plan applies.
- **AC-13 example and edit distance.** "secuirty" → "security" swaps two neighbouring letters. Plain Levenshtein counts that as 2 edits, so a one-edit fuzzy setting would not find it. The plan counts a swap of two adjacent letters as one edit (Damerau), using swapped-letter variants of the query word. Suggested wording for the AC: "one edit: insert, delete, substitute, or swap two adjacent letters".
- **AC-12 vs AC-14: which one wins.** The spec does not say. The plan sorts by (1) how many query words matched (AC-14), then (2) whether any match is in name, description or tags rather than only in body or plugin name (AC-12), then (3) the BM25 score, then (4) landing order.
- **Ids can collide.** `<plugin>:<name>` (AC-4) can repeat inside one plugin, for example a skill and an agent both named `review`. The plan keeps `id` exactly as the spec defines it. Detail URLs and search keys include the type (`plugins/<plugin>/skills/<name>/`), and the build prints a warning when two entries share an id. The spec could say whether ids must be unique.
- **Where component tags and category come from.** The spec does not say. The plan's rule:
  - Category is inherited from the plugin's marketplace entry.
  - Tags come from frontmatter `metadata.tags` when present, otherwise from the plugin's tags (entry `tags` ∪ `plugin.json` `keywords`).
  - `metadata.*` is used because claude.ai accepts only a fixed set of top-level skill keys (`docs/research/marketplace-setup.md:190-193`).
- **AC-9 "date".** The footer shows the **commit date**, so rebuilding the same ref gives the same output. `catalog.json` carries both `commitDate` and `builtAt` (the time of the build).
- **AC-17 label.** A `labels=` parameter in the URL is only applied for users with triage rights. The plan therefore uses an issue form, `.github/ISSUE_TEMPLATE/artifact-request.yml` with `labels: [request]`, which labels the issue for everyone, and pre-fills its fields through URL parameters. The `request` label must exist in the repository (manual step).
- **AC-23 counts.** The plan uses disjunctive faceting: the counts for one filter are computed with every other filter applied but not that filter's own selection. Selecting "skill" therefore does not set the "agent" count to 0.
- **Query made only of filler words** (e.g. "I need a"): treated like an empty query, so all artifacts are shown (AC-15).
- **Unsafe names fail the build.** Names that are not URL- and filename-safe (`^[A-Za-z0-9][A-Za-z0-9._-]*$`) fail under AC-6 with the file path and reason. They become path segments, and `:` cannot be used in a file name on Windows.
- **Plugin README.** It is not listed in AC-27/AC-28 or in Inputs. The plan does not render it on the plugin page; it is a possible later addition.
- **AC-15 group order** (the spec does not fix it): skill, agent, command, hooks, mcp.

## Codebase map
| Area | Existing code to follow | Notes |
|---|---|---|
| Root tooling | `package.json:1-14` | No dependencies, ESM, `node --test`. The site must not add any dependency here. |
| Plugin source resolution | `scripts/lib/release-lib.mjs:93-126` (`locatePlugin`; `metadata.pluginRoot` at `:108-113`) | Reproduce the same rules in TypeScript: `./` sources and bare names under `pluginRoot`, `..` rejected. Do not import this file from the site. |
| Test style | `scripts/lib/release-lib.test.mjs:1-37` | `describe`/`it` with strict asserts. The site uses Vitest in the same style. |
| Marketplace layout | `docs/research/marketplace-setup.md:45-73` | Default component locations: `skills/<s>/SKILL.md`, `agents/*.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json`, `output-styles/`. |
| Entry and manifest fields | `docs/research/marketplace-setup.md:94-121`, `:137-163` | Entries carry name, source, description, category and tags; `plugin.json` carries version, license, author, keywords and component path overrides. |
| Hooks shape | `docs/research/marketplace-setup.md:165-176` | Top-level `hooks` → event → `[{ matcher, hooks: [{ type, command }] }]`. |
| Skill frontmatter | `docs/research/marketplace-setup.md:181-193` | `name` defaults to the directory name; `description` is required by AC-6. |
| Release and rollback doc | `docs/releasing.md:8` | Its site row says "see the site spec" → point it to the new `docs/catalog-site.md`. |
| Approach notes | `specs/research/feat-1-catalog-site.md:12-33` | Build step, MiniSearch, Astro, deploy-pages, sanitizing; catalog kept separate from the search index for phase 2. |
| Curated notes | None | The repository has no `AGENTS.md` or `INSIGHTS.md`, so every task's **Insights** is None. |

The repository has no commits yet. `scripts/`, `docs/` and `specs/` must be committed to `main` before `feat/1-catalog-site` is branched off it.

## Contract

**Library and tool choices** (installed only in `site/`):

| Choice | Why |
|---|---|
| `site/` package with its own `package.json` + `package-lock.json` | Root tooling stays dependency-free, so `npm run release` and the root `npm test` need no install. Astro's large `node_modules` exists only for site work and CI. `site/` is not a plugin, so Claude Code never copies it. |
| npm | The root already uses npm scripts. `npm ci` plus the `actions/setup-node` npm cache, no corepack/pnpm setup step. Plugin directories also need npm lockfiles (pnpm lockfiles are ignored, `marketplace-setup.md:208-210`), so one package manager across the repo. |
| Astro (current stable major), static output | `getStaticPaths` gives one crawlable page per artifact at a stable URL, plus `404.html`. `base` handles the `/agentic-engineering/` prefix. Zero JavaScript by default, islands only where needed. |
| Preact via `@astrojs/preact` | About 4 KB runtime for the search, filter and copy islands. JSX escapes text, so queries and artifact strings never become HTML. |
| MiniSearch | Prefix matching and per-term fuzzy matching (a function of term length), field boosts, `toJSON`/`loadJSON` so the index is built at build time, no dependencies. |
| Rejected search libraries | Fuse.js: scans every document and ranks multi-word queries poorly. Pagefind: indexes per HTML page, has no facet counts over our fields and less control over ranking. FlexSearch: weaker typo handling and API churn. |
| `yaml` (eemeli) | YAML 1.2 frontmatter parser whose errors include line and column (AC-6). |
| `unified` + `remark-parse` + `remark-gfm` + `remark-rehype` + `rehype-sanitize` + `rehype-external-links` + `rehype-stringify` + `mdast-util-to-string` | Build-time markdown → sanitized HTML and plain text. No DOM is needed (DOMPurify on the server would need jsdom). |
| Vitest | Runs the TypeScript sources directly on Astro's own Vite toolchain. `node --test` would need a TS loader for `.ts` modules. |
| `@playwright/test` (Chromium only) + `@axe-core/playwright` | Real browser with clipboard permissions, request observation, keyboard, multiple tabs and a `webServer` hook; axe covers the WCAG smoke check. |
| `ajv` (2020-12) + `ajv-formats` (dev only) | Validates `catalog.json` against the published JSON Schema (AC-30). |

**Published files** (all under `/agentic-engineering/`, `trailingSlash: 'always'`, `build.format: 'directory'`):
- `catalog.json` — `CatalogDocument`, the public catalog (AC-30). No bodies.
  - `{ $schema, schemaVersion: 1, marketplace: { name, description, owner, addCommand, url }, commit, commitDate, builtAt, entries: CatalogEntry[] }`
  - Entries are in landing order.
- `CatalogEntry` — `{ id, type: 'plugin'|'skill'|'agent'|'command'|'hooks'|'mcp', name, plugin, pluginVersion: string|null, description, tags: string[], category: string|null, path, sourceUrl, detailUrl, install }`
  - `id` is `<plugin>` for plugins and `<plugin>:<name>` for components; the hooks entry is `<plugin>:hooks`.
  - `install` is `/plugin install <plugin>@<marketplace>`.
  - `sourceUrl` is `https://github.com/<repo>/{tree|blob}/<commit>/<path>`.
  - `detailUrl` is absolute.
- `catalog.schema.json` — JSON Schema (2020-12) of `CatalogDocument`. This is "the documented shape" of AC-30.
- `search-index.json` — `SearchIndexFile { version: 1, minisearch: <MiniSearch JSON> }`. Kept separate from the catalog so phase 2 can add a vector file next to it.
- `llms.txt` — follows the llmstxt.org layout: title, summary, the marketplace-add command, a link to `catalog.json`, then per plugin a list of `- [name](detailUrl): description (type)`.
- Pages:
  - `/` — landing.
  - `/plugins/<plugin>/` — plugin page.
  - `/plugins/<plugin>/{skills|agents|commands|mcp}/<name>/` — component pages.
  - `/plugins/<plugin>/hooks/` — the plugin's hooks page.
  - `/404.html` — not-found page (served by Pages for any missing path).

**Build-time model** (`site/src/catalog/types.ts`, Node only):
- `Artifact extends CatalogEntry` adds:
  - `detailPath` (relative to the base);
  - `bodyHtml: string|null` (sanitized) and `bodyText: string`;
  - `files: RepoFile[]` where `RepoFile` is `{ path, url }`;
  - `hooks?: HookRow[]` where `HookRow` is `{ event, matcher: string|null, type, command: string|null }`;
  - `mcp?: McpServerInfo` — `{ name, transport, command: string|null, args: string[], url: string|null }`;
  - `pluginInfo?: { license: string|null, author: { name, url: string|null }|null, changelogHtml: string|null, otherComponents: string[] }`.
- `BuildInfo { commit, commitDate, builtAt }`.
- `buildCatalog(options: { root: string; repo: string; siteUrl: string; buildInfo: BuildInfo }): BuildResult`, where `BuildResult` is `{ marketplace, artifacts: Artifact[], warnings: string[], buildInfo }`.
  - It throws `CatalogBuildError { problems: { path: string; reason: string }[] }` after collecting all problems (AC-6).

**Search and browse** (`site/src/search/`, pure: no fs, no DOM, no fetch):
- `prepareQuery(raw): string[]` — keeps the first 200 characters, lowercases, removes punctuation, drops filler words, applies a light English stemmer (-ing, -ed, -es, -s; stem of at least 3 letters) and dedupes.
- `createIndex(docs: SearchDoc[])`, where `SearchDoc` is `{ id: detailPath, name, description, tags, plugin, body }` and `body` is cut to `BODY_INDEX_CHARS = 4000`.
- `serializeIndex`, `loadIndex`.
- `search(index, query): SearchHit[]`, where `SearchHit` is `{ id, score, matchedWords, primaryHit }`.
- `Filters { type, plugin, category, tag: string[] }`; `applyFilters` (OR within one filter, AND across filters); `facetCounts` (disjunctive); `landingCompare`.
- `parseUrlState(search, known)` / `serializeUrlState(state)` — URL format `?q=…&type=skill&type=agent&plugin=…&category=…&tag=…`. Unknown values are dropped.
- `requestIssueUrl(repo, state)` → `https://github.com/<repo>/issues/new?template=artifact-request.yml&title=Request%3A+<q>&query=<q>&filters=<type: …; plugin: …>`.

**Issue form:** `.github/ISSUE_TEMPLATE/artifact-request.yml`, `labels: [request]`, field ids `query` (input), `filters` (input), `details` (textarea).

**Environment** (build only):

| Variable | Default | Purpose |
|---|---|---|
| `CATALOG_ROOT` | `..`, relative to `site/` | Marketplace root the catalog is built from |
| `CATALOG_REPO` | `GITHUB_REPOSITORY`, else `nazardrahusevych/agentic-engineering` | Repository used in source and issue links |
| `CATALOG_COMMIT`, `CATALOG_COMMIT_DATE` | unset | Test-only overrides of the build commit and date |

**Workflow:** `.github/workflows/pages.yml`
- Triggers: `push` on `main`, `pull_request`, and `workflow_dispatch` with input `ref` (string, required, default `main`).
- Job `build` (contents: read): checks out the ref, runs `npm ci`, typecheck, unit tests, build and e2e. It uploads the Pages artifact only when the event is not a PR.
- Job `deploy`: `needs: build`, `if: github.event_name != 'pull_request'`, permissions `pages: write` and `id-token: write`, environment `github-pages`, runs `actions/deploy-pages`.

**DB / routes / events:** None.

## Constraints
- **Root stays zero-dependency.** Nothing is added to the root `package.json`, and the root `npm test` keeps working unchanged.
- **Do not edit** `scripts/**`, `docs/research/**` or `specs/**`.
- **No `:` in generated paths.**
- **Layers inside `site/src`:**
  - `catalog/` is Node-only build code (fs, child_process). Only `.astro` pages, endpoints and `lib/catalog-data.ts` import it; islands may import only its types (`import type`).
  - `search/` is pure and isomorphic; both the build and the islands use it.
  - `components/*.tsx` islands may import `search/` and types, never `catalog/` runtime code.
- **Untrusted text** (spec `:212-217`):
  - `set:html` is used only with `bodyHtml`/`changelogHtml` from `renderMarkdown`.
  - No `dangerouslySetInnerHTML` in islands.
  - Query and URL parameters reach the DOM only as text nodes or attribute values.
  - Links are limited to http(s) and repository-relative targets (rewritten to GitHub URLs) and get `rel="noopener noreferrer"`.
- **No third-party requests at runtime:** no CDN fonts or scripts. Markdown images become links (alt text → URL), never `<img>`.
- **Base path:** every internal link and fetch goes through `import.meta.env.BASE_URL`.
- **Repo root comes from `process.cwd()`** (`site/`) plus `CATALOG_ROOT`, never from `import.meta.url`: Astro bundles pages into chunks, which changes `import.meta.url`.
- **Fixtures stay in tests:** fixtures under `site/test/fixtures/` are never referenced by the real `.claude-plugin/marketplace.json`.
- **Workflow security:** pin third-party actions to a full commit SHA with a version comment; set least-privilege `permissions` per job.

## Skills
This repository has no `.claude/skills`, so no skill is required. The column lists general practice to apply.

| Zone | Agent | Skills |
|---|---|---|
| site-build (`site/src/catalog`, `site/src/search`, `site/test`) | main session | None. Practice: strict TypeScript, pure functions with tests, parse untrusted files at the edge. |
| site-ui (`site/src/pages`, `components`, `layouts`, `site/e2e`) | main session | None. Practice: thin pages, logic in `search/`, accessible controls, no raw HTML from data. |
| ci / repo (`.github/`, root files, `docs/`) | main session | None. Practice: SHA-pinned actions, least-privilege tokens. |

## Tasks

### T1 — Scaffold the site package and the marketplace skeleton
- **Zone:** repo + site-build · **Agent:** main session · **Wave:** 1
- **Covers:** integration (the base for every AC)
- **Depends on:** None
- **Skills:** None
- **Owns:**
  - `site/package.json` (new), `site/package-lock.json` (generated)
  - `site/astro.config.mjs` (new), `site/tsconfig.json` (new), `site/vitest.config.ts` (new)
  - `site/src/pages/index.astro` (new placeholder)
  - `.gitignore` (new)
  - `.claude-plugin/marketplace.json` (new)
- **Reads:** `package.json:1-14` (engines and ESM conventions); `docs/research/marketplace-setup.md:77-92` (minimal `marketplace.json`).
- **Insights:** None
- **Do:**
  1. Create `site/package.json`: `private`, `type: module`, `engines.node >=22`. Install every dependency now, so the lockfile changes only in this task:
     - runtime: `astro`, `@astrojs/preact`, `preact`, `minisearch`, `yaml`, `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, `rehype-external-links`, `rehype-stringify`, `mdast-util-to-string`;
     - dev: `typescript`, `@astrojs/check`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `ajv`, `ajv-formats`.
  2. Add the scripts:

     | Script | Command |
     |---|---|
     | `dev` | `astro dev` |
     | `build` | `astro build` |
     | `typecheck` | `astro check` |
     | `test` | `vitest run` |
     | `test:e2e` | `node scripts/build-e2e.mjs && playwright test` |

  3. `astro.config.mjs`: `site: 'https://nazardrahusevych.github.io'`, `base: '/agentic-engineering'`, `trailingSlash: 'always'`, `output: 'static'`, `build.format: 'directory'`, `integrations: [preact()]`.
  4. `tsconfig.json`: extends `astro/tsconfigs/strict`, `jsxImportSource: preact`; excludes `dist`, `dist-e2e` and `test/fixtures`.
  5. `vitest.config.ts`: environment `node`; include `src/**/*.test.ts` and `test/**/*.test.ts`; exclude `e2e/**`.
  6. Root `.gitignore`: `node_modules/`, `site/dist/`, `site/dist-e2e/`, `site/.astro/`, `site/test-results/`, `site/playwright-report/`.
  7. Real `.claude-plugin/marketplace.json` skeleton: `name: agentic-engineering`, `owner.name`, `description`, `plugins: []`.
     - Why add it: the build needs the file, `/plugin marketplace add` and the release scripts already expect it, and an empty marketplace is a supported edge case (spec `:156`).
  8. `index.astro`: a placeholder page (T9 replaces it).
- **Tests:** None (no behaviour yet).
- **Acceptance:**
  - `npm ci` and `npm run build` succeed in `site/`, and `site/dist/index.html` exists (integration).
  - The root `npm test` still passes, and the root `package.json` is unchanged.
- **Verify:** `cd site && npm ci && npm run typecheck && npm run build` · `npm test` (root)

### T2 — Add the fixture marketplace
- **Zone:** site-build · **Agent:** main session · **Wave:** 2
- **Covers:** AC-3, AC-4, AC-5 (test data); also feeds AC-11–AC-32
- **Depends on:** T1
- **Skills:** None
- **Owns:** `site/test/fixtures/marketplace/**` (new, listed below), `site/test/fixtures/marketplace.expected.json` (new), `site/test/fixtures/README.md` (new), `site/test/helpers/fixture.ts` (new), `site/test/helpers/fixture.test.ts` (new)
- **Reads:** `docs/research/marketplace-setup.md:45-73`, `:165-186`
- **Insights:** None
- **Do:**
  1. Marketplace: `.claude-plugin/marketplace.json` named `agentic-engineering`, listing:
     - `alpha` (`./plugins/alpha`, category `quality`, tags `[review, security]`);
     - `beta` (`./plugins/beta`, category `workflow`, tags `[specs]`).
  2. `plugins/alpha/`:
     - `.claude-plugin/plugin.json` (version `1.2.0`, `license: MIT`, author with url, `keywords: [audit]`);
     - `CHANGELOG.md`;
     - `skills/security-audit/SKILL.md`;
     - `skills/code-review/SKILL.md` (description "Review pull requests…", `metadata.tags: [review, pr]`) and `skills/code-review/reference.md`;
     - `agents/reviewer.md`;
     - `commands/deploy-check.md` (no frontmatter description; the first body line is used);
     - `hooks/hooks.json` (`PreToolUse`/`Bash` and `PostToolUse`/`Edit|Write`) and `scripts/check-command.mjs`;
     - `.mcp.json` (server `docs-search` with command and args);
     - `output-styles/terse.md` (gets no card; appears only in the plugin's file list).
  3. `plugins/beta/`:
     - `.claude-plugin/plugin.json` (`0.3.0`, `Apache-2.0`) and `CHANGELOG.md`;
     - `skills/code-review/SKILL.md` (same name as alpha's);
     - `skills/spec-writer/SKILL.md` (the word "zebrafish" only in its body; "security" only in its body);
     - `skills/unsafe-markdown/SKILL.md`: `<script>`, `<img onerror>`, `<iframe>`, a `javascript:` link, raw `<div onclick>`, an external image, and a relative link;
     - `agents/planner.md` ("security" only in its body).
  4. `plugins/unlisted/` (has `plugin.json` and `skills/ghost/SKILL.md`; not listed in the marketplace).
  5. `marketplace.expected.json`: the exact 12 `{ id, type }` entries in landing order:
     - 2 plugins;
     - alpha: 2 skills, 1 agent, 1 command, hooks, mcp;
     - beta: 3 skills, 1 agent.
  6. `helpers/fixture.ts`:
     - `copyFixture(name): Promise<string>` — copies to a temporary directory;
     - `writeFixtureFile(root, relPath, text)`;
     - `tryCreateSymlink(target, path): boolean` — returns false when symlinks are not available on Windows.
- **Tests:** `site/test/helpers/fixture.test.ts` — the copy matches the source tree (support for AC-3).
- **Acceptance:** the fixture tree matches the list above; `README.md` says which test relies on which file (AC-3, AC-5).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run test/helpers/fixture.test.ts`

### T3 — Parse frontmatter, render sanitized markdown, read build info
- **Zone:** site-build · **Agent:** main session · **Wave:** 3
- **Covers:** AC-6 (frontmatter errors), AC-27 (body rendering), AC-9 (build metadata), Untrusted inputs
- **Depends on:** T1
- **Skills:** None
- **Owns:** `site/src/catalog/problems.ts`, `frontmatter.ts`, `markdown.ts`, `build-info.ts`, `frontmatter.test.ts`, `markdown.test.ts`, `build-info.test.ts` (all new, under `site/src/catalog/`)
- **Reads:** spec `specs/feat-1-catalog-site.md:212-217`
- **Insights:** None
- **Do:**
  1. `problems.ts`: `CatalogProblem { path, reason }` and `class CatalogBuildError extends Error { problems }`. The message lists one `path: reason` per line.
  2. `parseFrontmatter(text, path): { data: Record<string, unknown>; body: string }`.
     - Handles `---` blocks with LF or CRLF; no block → `data = {}`.
     - YAML errors throw a problem `invalid frontmatter: <message> (line n)`.
     - Non-object YAML is also a problem.
  3. `renderMarkdown(md, ctx: { repo, commit, fileDir }): string`, pipeline: remark-parse → remark-gfm → remark-rehype (`allowDangerousHtml: false`) → a custom step → rehype-sanitize → rehype-external-links → stringify.
     - Raw HTML is dropped.
     - The custom step turns images into links and rewrites repository-relative links to `https://github.com/<repo>/blob/<commit>/<resolved>`.
     - rehype-sanitize uses the default schema with `href` limited to `http` and `https`.
     - rehype-external-links adds `target=_blank` and `rel="noopener noreferrer"`. It runs after sanitizing, so it is trusted.
  4. `markdownToText(md): string` with collapsed whitespace.
  5. `readBuildInfo(cwd, env): BuildInfo`.
     - Reads `git rev-parse HEAD` and `git show -s --format=%cI HEAD` through `execFileSync`; `builtAt` is the current time.
     - `CATALOG_COMMIT` and `CATALOG_COMMIT_DATE` override the values.
     - When git fails, the commit is `unknown` and a warning string is returned (the repo has no commits yet).
- **Tests:**
  - `frontmatter.test.ts` — AC-6: broken YAML gives the path and line; CRLF works; no frontmatter → empty data.
  - `markdown.test.ts`, Untrusted inputs / AC-27:
    - no `<script>`, `on*` attributes, `<iframe>` or `javascript:` in the output; no `<img>`;
    - relative links point to GitHub at the commit; external links carry `noopener`;
    - GFM tables render.
  - `build-info.test.ts` — AC-9: env overrides win; a non-git directory gives `unknown` plus a warning.
- **Acceptance:** every case above passes (AC-6, AC-9, AC-27).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run src/catalog/frontmatter.test.ts src/catalog/markdown.test.ts src/catalog/build-info.test.ts`

### T4 — Build the catalog from a repository
- **Zone:** site-build · **Agent:** main session · **Wave:** 4
- **Covers:** AC-3, AC-4, AC-5, AC-6, AC-26 (URL scheme), AC-27 and AC-28 (data)
- **Depends on:** T2, T3
- **Skills:** None
- **Owns:** `site/src/catalog/types.ts`, `paths.ts`, `marketplace.ts`, `plugin.ts`, `components.ts`, `build-catalog.ts`, `build-catalog.test.ts`, `build-catalog.errors.test.ts` (all new, under `site/src/catalog/`)
- **Reads:** `scripts/lib/release-lib.mjs:93-126` (source resolution rules); `docs/research/marketplace-setup.md:94-163`
- **Insights:** None
- **Do:**
  1. `types.ts`: the Contract types.
  2. `paths.ts`:
     - `detailPath(type, plugin, name)` returns `plugins/<p>/`, `plugins/<p>/{skills|agents|commands|mcp}/<name>/` or `plugins/<p>/hooks/`;
     - `isSafeName(name)`;
     - `sourceUrl(repo, commit, path, isDir)`.
  3. `marketplace.ts`:
     - `readMarketplace(root)` parses the JSON; a missing or invalid file is a problem.
     - `resolveSource(entry, pluginRoot)` accepts `./` sources and bare names under `metadata.pluginRoot`; `..` is a problem. External sources give a plugin-only entry plus a warning.
     - `findUnlistedPluginDirs(root, listed)` scans `plugins/*` (and `pluginRoot`) for AC-5 warnings: `<dir> is not listed in .claude-plugin/marketplace.json; skipped`.
  4. `plugin.ts`: `readPlugin(...)`.
     - Parses `plugin.json`; if it is missing, the entry is the manifest and a warning is given.
     - Reads version, license, author, keywords and `CHANGELOG.md` (rendered).
     - Component paths:
       - defaults: `skills/`, `agents/`, `commands/`, `hooks/hooks.json`, `.mcp.json`;
       - `plugin.json` overrides: `skills` (string or array, added to the defaults); `agents` and `commands` (string or array, replace the defaults; each a directory or `.md` file); `hooks` and `mcpServers` (a path or an inline object).
  5. `components.ts`:
     - **Skills:** `skills/<dir>/SKILL.md`; the name is frontmatter `name` or the directory name.
     - **Agents:** top-level `agents/*.md`; the name is `name` or the file name.
     - **Commands:** top-level `commands/*.md`; the description is frontmatter `description`, else the first body line.
     - **Hooks:** validate the shape and build `HookRow[]`. The description is `hooks.json.description`, else a generated `Hooks: PreToolUse (Bash), …`.
     - **MCP:** accept `{ mcpServers: {...} }` or a flat map; the transport is stdio (`command`) or http/sse (`url`).
     - **Failures (AC-6):** a skill or agent without a description, invalid JSON, an invalid hooks or MCP shape, or an unsafe name.
     - **File lists:** follow symlinks with `stat`; skip `node_modules` and `.git`; at most 500 files per plugin.
       - Skill: its directory, recursively.
       - Agent or command: its own file.
       - Hooks: the `hooks/` directory.
       - MCP: `.mcp.json`.
       - Plugin: the whole plugin directory, so output styles and other types without cards appear by name.
  6. `build-catalog.ts`: `buildCatalog(options)`.
     - Collects problems across all plugins and throws one `CatalogBuildError`.
     - Fills `install` as `/plugin install <plugin>@<marketplace.name>`.
     - Tags (lowercased, deduped): for plugins, entry `tags` ∪ `keywords`; for components, `metadata.tags`, else the plugin's tags.
     - Category: inherited from the plugin entry.
     - Warns on a duplicate `id` within a plugin.
     - Sorts with the landing order: plugins, then skill, agent, command, hooks, mcp, each by name, then by plugin. The comparator is in T6; T4 sorts by the same keys and T6 reuses `site/src/search/browse.ts#landingCompare` when it lands. Alternatively export `TYPE_ORDER` from `paths.ts` and use it in both places.
- **Tests:**
  - `build-catalog.test.ts`:
    - AC-3: the fixture gives exactly `marketplace.expected.json`.
    - AC-4: each entry has every field; `alpha:code-review` and `beta:code-review` are separate.
    - AC-5: `unlisted` is absent and named in `warnings`.
    - AC-26: `detailPath` is deterministic across two builds.
    - AC-27/28: plugin info (version, license, author, changelog HTML), hooks rows, MCP info, files include `reference.md` and `output-styles/terse.md`.
    - Edge cases: an empty `plugins: []` gives zero entries and no error; a skill shared through a symlink (created at runtime, skipped without symlink support) gives two entries; a `plugin.json` `skills` override is indexed.
  - `build-catalog.errors.test.ts` — AC-6, one mutated copy each, each failing with its path and reason:
    - broken `marketplace.json`;
    - broken `plugin.json`;
    - bad frontmatter;
    - skill without a description;
    - agent without a description;
    - broken `hooks.json` (JSON and shape);
    - broken `.mcp.json`;
    - unsafe name.
    - Also: two broken files are reported together.
- **Acceptance:** all of the above (AC-3, AC-4, AC-5, AC-6, AC-26, AC-27, AC-28).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run src/catalog/build-catalog.test.ts src/catalog/build-catalog.errors.test.ts`

### T5 — Keyword search engine
- **Zone:** site-build · **Agent:** main session · **Wave:** 5
- **Covers:** AC-10 (local, plain text), AC-11, AC-12, AC-13, AC-14, AC-32
- **Depends on:** T1
- **Skills:** None
- **Owns:** `site/src/search/types.ts`, `text.ts`, `engine.ts`, `text.test.ts`, `engine.test.ts` (all new, under `site/src/search/`)
- **Reads:** `specs/research/feat-1-catalog-site.md:16-19`
- **Insights:** None
- **Do:**
  1. `text.ts`:
     - `MAX_QUERY_CHARS = 200`.
     - `STOPWORDS`: about 40 English filler words (i, me, my, we, need, needs, want, wants, looking, a, an, the, for, to, of, in, on, with, and, or, that, some, something, anything, please, can, could, would, is, are, be, it, this, how, do, does…). Not type words like "skill".
     - `normalize`, `stem`, `prepareQuery` (Contract).
     - `transpositions(word)`: variants with two adjacent letters swapped, only for words of 5+ letters.
  2. `engine.ts`:
     - `SEARCH_OPTIONS`, shared by the build and the browser: fields `name`, `description`, `tags`, `plugin`, `body`; the same tokenizer and `processTerm` (stem) at index and query time.
     - Search behaviour: `prefix: true`; `fuzzy: (term) => term.length >= 5 ? 1 : 0`; boosts name 4, tags 3, description 2, plugin 1.5, body 1.
     - `search()` runs one subquery per prepared word: `OR` of the word and its transpositions. It collects per document the matched words, `primaryHit` (a match in name, description or tags, read from `result.match`) and the summed score.
     - Sort: `matchedWords` desc, then `primaryHit` desc, then score desc.
     - An effectively empty query returns `null` (meaning "no query").
     - Input is plain text only: never a `RegExp`, no HTML.
- **Tests:**
  - `text.test.ts`:
    - AC-32: the example sentence becomes `[skill, review, pull, request]`.
    - The 200-character cap.
    - HTML, quotes and regex characters are treated as plain text.
    - Transpositions apply only to words of 5+ letters.
  - `engine.test.ts`, with in-memory docs:
    - AC-11: a term found only in each of the five fields returns the doc.
    - AC-12: a name match ranks above a body-only match.
    - AC-13: "secur" and "secuirty" find "security"; a 4-letter typo does not match.
    - AC-14: a doc matching 2 of 3 words ranks above one matching 1.
    - AC-32: the example sentence ranks the review docs first.
    - Round trip: `serializeIndex` → `loadIndex` gives the same results.
    - Performance (NFR): 500 synthetic docs, median query time under 50 ms over 10 runs.
- **Acceptance:** every case above passes (AC-10, AC-11–AC-14, AC-32).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run src/search/text.test.ts src/search/engine.test.ts`

### T6 — Browse state: ordering, filters, counts, URL, request link
- **Zone:** site-build · **Agent:** main session · **Wave:** 6
- **Covers:** AC-15, AC-17, AC-23, AC-24, AC-25
- **Depends on:** T4, T5
- **Skills:** None
- **Owns:** `site/src/search/browse.ts`, `url-state.ts`, `request-link.ts`, `browse.test.ts`, `url-state.test.ts`, `request-link.test.ts` (all new, under `site/src/search/`); `site/src/catalog/build-catalog.ts` (edit: switch to `landingCompare`)
- **Reads:** `site/src/catalog/paths.ts` (type order)
- **Insights:** None
- **Do:**
  1. `browse.ts`:
     - `TYPE_ORDER`, `landingCompare`.
     - `applyFilters(entries, filters)`: OR within one filter, AND across filters.
     - `facetCounts(entries, filters)`: disjunctive; returns options with counts, including zero counts for selected options.
     - `orderResults(entries, hits | null)`: landing order when there is no query, otherwise hit order.
     - `hasActiveFilters`.
  2. `url-state.ts`:
     - `parseUrlState(search, known)` uses `URLSearchParams`; repeated keys hold several values; unknown values are dropped; `q` is cut to 200 characters.
     - `serializeUrlState` writes a stable key order and leaves out empty values.
  3. `request-link.ts`: `requestIssueUrl(repo, state)`, built only with `URLSearchParams` (Contract fields).
- **Tests:**
  - `browse.test.ts`:
    - AC-15: landing order.
    - AC-24: OR within a filter and AND across filters.
    - AC-23: counts change with the result set; disjunctive counts.
  - `url-state.test.ts` — AC-25: round trip; unknown values are dropped and known ones kept; characters are encoded.
  - `request-link.test.ts` — AC-17: the template, title, `query` and `filters` parameters are encoded; HTML in the query stays an encoded parameter.
- **Acceptance:** every case above passes (AC-15, AC-17, AC-23, AC-24, AC-25).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run src/search/browse.test.ts src/search/url-state.test.ts src/search/request-link.test.ts src/catalog/build-catalog.test.ts`

### T7 — Publish catalog.json, the schema, llms.txt and the search index
- **Zone:** site-build · **Agent:** main session · **Wave:** 7
- **Covers:** AC-30, AC-31; AC-5 and AC-6 surfaced in the build output; AC-13 and AC-32 over the fixture
- **Depends on:** T4, T5, T6
- **Skills:** None
- **Owns:** `site/src/catalog/publish.ts` (new), `site/src/catalog/publish.test.ts` (new), `site/src/lib/catalog-data.ts` (new), `site/src/pages/catalog.json.ts` (new), `site/src/pages/search-index.json.ts` (new), `site/src/pages/llms.txt.ts` (new), `site/public/catalog.schema.json` (new), `site/test/search-fixture.test.ts` (new)
- **Reads:** Contract above
- **Insights:** None
- **Do:**
  1. `publish.ts`:
     - `toCatalogDocument(result, siteUrl)` — AC-4 fields plus `detailUrl`; `$schema` points to `<siteUrl>catalog.schema.json`.
     - `toSearchDocs(artifacts)` — body cut to 4,000 characters.
     - `toLlmsTxt(document)`.
  2. `catalog-data.ts`: `getCatalog()` is memoized for the build process.
     - Root is `resolve(process.cwd(), process.env.CATALOG_ROOT ?? '..')`; the repo comes from `CATALOG_REPO`.
     - It prints each warning as `warning: …`. A `CatalogBuildError` is printed and then thrown again, so `astro build` fails with every path and reason (AC-6).
     - It also memoizes the serialized `catalog.json` and `search-index.json` and warns when their combined gzip size passes 400 KB (NFR).
  3. Endpoints are prerendered `GET` handlers that return the memoized strings with the right content types.
  4. `catalog.schema.json`: draft 2020-12, `additionalProperties: false` on the entry, `format: uri` and `date-time`.
- **Tests:**
  - `publish.test.ts`:
    - AC-30: the document built from the fixture validates with ajv against `public/catalog.schema.json`; it carries `schemaVersion` and `commit`; every entry has a `detailUrl` under the site URL.
    - AC-31: `llms.txt` holds the marketplace description, the catalog link, and each plugin with its components and detail URLs.
  - `site/test/search-fixture.test.ts` — AC-32 and AC-13 against the real fixture pipeline (build → search docs → index): the example sentence ranks `alpha:code-review` and `beta:code-review` first; "secuirty" finds `alpha:security-audit`; "zebrafish" finds `beta:spec-writer` (AC-11 body).
- **Acceptance:** with `CATALOG_ROOT=test/fixtures/marketplace`, `npm run build` writes `dist/catalog.json`, `search-index.json`, `llms.txt` and `catalog.schema.json`, and the output includes the `unlisted` warning (AC-5, AC-30, AC-31).
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run src/catalog/publish.test.ts test/search-fixture.test.ts` · `cd site && npm run build`

### T8 — Layout, footer and the e2e harness
- **Zone:** site-ui · **Agent:** main session · **Wave:** 8
- **Covers:** AC-9; NFR (theme, no-JS message, base path)
- **Depends on:** T7
- **Skills:** None
- **Owns:** `site/src/layouts/Base.astro` (new), `site/src/styles/global.css` (new), `site/src/components/Footer.astro` (new), `site/scripts/build-e2e.mjs` (new), `site/e2e/serve.mjs` (new), `site/playwright.config.ts` (new), `site/e2e/footer.spec.ts` (new)
- **Reads:** `site/src/lib/catalog-data.ts`
- **Insights:** None
- **Do:**
  1. `Base.astro`:
     - `lang="en"`, title and description, a skip link, a header link to the landing page, `<slot/>`, `<Footer/>`.
     - A `<noscript>` "JavaScript is required to search" message.
     - `<meta name="color-scheme" content="light dark">`.
  2. `global.css`:
     - System font stack; light and dark themes through `prefers-color-scheme`; visible `:focus-visible`.
     - Card grid works from 360 px without horizontal scroll; `.clamp-2` line clamp.
  3. `Footer.astro`: "Built from `<sha7>` (`<commit date YYYY-MM-DD>`)", linking to `https://github.com/<repo>/commit/<sha>`, with a link to `catalog.json`.
  4. `build-e2e.mjs`:
     - No dependencies beyond astro.
     - Sets `process.env.CATALOG_ROOT = 'test/fixtures/marketplace'` and calls the Astro `build({ root, outDir: './dist-e2e' })` API, so it works on Windows without inline env syntax.
  5. `e2e/serve.mjs`: a `node:http` static server that behaves like GitHub Pages.
     - Serves `dist-e2e` under `/agentic-engineering/`.
     - A directory serves its `index.html`; a missing trailing slash on a directory gets a 301.
     - A missing path gets status 404 with `404.html`.
     - Guards against path traversal; sets correct content types.
     - Chosen over `astro preview` for a faithful 404 fallback.
  6. `playwright.config.ts`: Chromium only, `baseURL: http://127.0.0.1:4321/agentic-engineering/`, `webServer: node e2e/serve.mjs dist-e2e 4321`, `reuseExistingServer: !process.env.CI`.
- **Tests:** `site/e2e/footer.spec.ts` — AC-9: the footer shows `commit.slice(0,7)` and the date from `dist-e2e/catalog.json`, read from disk in the test.
- **Acceptance:** the footer matches the build metadata (AC-9); the no-JS message is present.
- **Verify:** `cd site && npm run typecheck` · `cd site && npm run test:e2e -- e2e/footer.spec.ts`

### T9 — Landing page, result cards and copy-install
- **Zone:** site-ui · **Agent:** main session · **Wave:** 9
- **Covers:** AC-15, AC-19, AC-20, AC-21, AC-22
- **Depends on:** T8
- **Skills:** None
- **Owns:** `site/src/pages/index.astro` (edit), `site/src/components/CopyCommand.tsx` (new), `site/src/components/search/SearchApp.tsx` (new), `site/src/components/search/ResultCard.tsx` (new), `site/e2e/landing.spec.ts` (new)
- **Reads:** `site/src/search/browse.ts`, `site/src/search/engine.ts`
- **Insights:** None
- **Do:**
  1. `CopyCommand.tsx` props: `{ command, label }`.
     - Clicking calls `navigator.clipboard.writeText` and shows "Copied" in an `aria-live="polite"` region for 2,000 ms (AC-20).
     - If the clipboard is missing or the write is rejected, it renders a read-only `<input>` with the command, focused and selected, plus a "Press Ctrl+C / ⌘C" hint (AC-21).
  2. `index.astro`:
     - Base layout with an intro.
     - The marketplace-add command `/plugin marketplace add nazardrahusevych/agentic-engineering` through `<CopyCommand client:load>` (AC-22).
     - `<SearchApp client:load base={BASE_URL} repo={...} />`.
  3. `SearchApp.tsx`, first version:
     - Fetches `catalog.json` and `search-index.json` once and in parallel.
     - Shows loading and error states.
     - Renders every entry in `landingCompare` order (AC-15).
     - Shows the result count in an `aria-live` region.
  4. `ResultCard.tsx`:
     - An `<article>` with: a type badge; the name as a link to the detail page (from the `detailUrl` path); the parent plugin; the description with `.clamp-2`; up to 3 tags; `<CopyCommand command={install}>` (AC-19).
     - The button is not inside the link.
     - All values are text nodes.
- **Tests:** `site/e2e/landing.spec.ts`
  - AC-15: the landing lists the 12 fixture entries in the order of `marketplace.expected.json`.
  - AC-19: a fixture card shows the badge, name, plugin, a 2-line clamped description, at most 3 tags and the button.
  - AC-20: with the clipboard permission granted, the clipboard holds `/plugin install alpha@agentic-engineering` and "Copied" shows, then disappears after about 2 s.
  - AC-21: with an `addInitScript` that makes `writeText` reject, the selected read-only field shows the command.
  - AC-22: the marketplace-add command and its copy button are present.
- **Acceptance:** every case above passes (AC-15, AC-19–AC-22).
- **Verify:** `cd site && npm run typecheck` · `cd site && npm run test:e2e -- e2e/landing.spec.ts`

### T10 — Search, filters, URL state and empty state
- **Zone:** site-ui · **Agent:** main session · **Wave:** 10
- **Covers:** AC-10, AC-16, AC-17, AC-18, AC-23, AC-25 (and AC-24 in the UI)
- **Depends on:** T9
- **Skills:** None
- **Owns:** `site/src/components/search/SearchApp.tsx` (edit), `site/src/components/search/use-search-state.ts` (new), `site/src/components/search/FilterPanel.tsx` (new), `site/src/components/search/EmptyState.tsx` (new), `site/e2e/search.spec.ts` (new), `site/e2e/filters-url.spec.ts` (new)
- **Reads:** `site/src/search/url-state.ts`, `site/src/search/request-link.ts`
- **Insights:** None
- **Do:**
  1. `use-search-state.ts`:
     - State `{ q, filters }`, initialised from `parseUrlState(location.search, known)` (AC-25).
     - Debounce of 80 ms, then `search()` → `orderResults` → `applyFilters` → `facetCounts`.
     - `history.replaceState(serializeUrlState(...))` on change; restore on `popstate`.
     - A document `keydown` handler: `/` focuses the search field unless the target is an input, textarea, select or contenteditable, and the default is prevented (AC-18).
  2. `SearchApp.tsx`:
     - A labelled `<input type="search">` and the result count in `aria-live`.
     - `<FilterPanel>`: one `<fieldset>` and `<legend>` per filter (type, plugin, category, tag), checkboxes labelled with their counts (AC-23).
     - `<EmptyState>`: a "Clear filters" button only when filters are set, and a "Request it" link `target=_blank rel="noopener noreferrer"` to `requestIssueUrl` (AC-16, AC-17).
  3. No fetch after the first load (AC-10).
- **Tests:**
  - `site/e2e/search.spec.ts`:
    - AC-10: results change while typing; no requests after the initial load (`page.on('request')`).
    - AC-16: a nonsense query shows the empty state and "Request it"; with a filter set it also shows "Clear filters".
    - AC-17: the link `href` equals the expected issue-form URL with the encoded query and filters.
    - AC-18: `/` focuses the field, but not while typing in it.
    - Untrusted: the query `<img src=x onerror=alert(1)>` triggers no dialog and is shown as text.
  - `site/e2e/filters-url.spec.ts`:
    - AC-23: counts change when the query changes.
    - AC-24: type `skill` OR `agent` combined AND with plugin `beta`.
    - AC-25: a reload keeps q and filters; a new page opened with the copied URL reproduces them; an unknown `type=bogus` is ignored while a known value is kept.
- **Acceptance:** every case above passes (AC-10, AC-16, AC-17, AC-18, AC-23, AC-24, AC-25).
- **Verify:** `cd site && npm run typecheck` · `cd site && npm run test:e2e -- e2e/search.spec.ts e2e/filters-url.spec.ts`

### T11 — Detail pages and the not-found page
- **Zone:** site-ui · **Agent:** main session · **Wave:** 11
- **Covers:** AC-26, AC-27, AC-28, AC-29 (and AC-20/AC-21 on detail pages)
- **Depends on:** T9
- **Skills:** None
- **Owns:** `site/src/pages/plugins/[plugin]/index.astro` (new), `site/src/pages/plugins/[plugin]/[...artifact].astro` (new), `site/src/components/detail/ArtifactDetail.astro` (new), `site/src/components/detail/HooksTable.astro` (new), `site/src/pages/404.astro` (new), `site/e2e/detail.spec.ts` (new), `site/e2e/not-found.spec.ts` (new)
- **Reads:** `site/src/catalog/types.ts`, `site/src/lib/catalog-data.ts`
- **Insights:** None
- **Do:**
  1. `getStaticPaths` from `getCatalog()`:
     - plugin pages: `{ plugin }`;
     - artifact pages: `{ plugin, artifact: 'skills/code-review' | 'hooks' | ... }` derived from `detailPath`.
  2. `ArtifactDetail.astro` shows:
     - header: type badge, name, `id`, plugin link and version;
     - the full description;
     - install: `<CopyCommand client:visible>`;
     - a source link (`rel="noopener noreferrer"`);
     - the body by type:
       - skill, agent, command: `set:html={bodyHtml}` (already sanitized);
       - hooks: `HooksTable` with event, matcher, type and command as `<code>` text;
       - MCP: name, transport, and command plus args or the url as text;
     - files: repo paths linking to GitHub;
     - "Other artifacts in <plugin>": links to the plugin's other artifacts.
  3. The plugin page adds version, license, author (a link only for an http(s) url) and the changelog (`changelogHtml`) (AC-28).
  4. `404.astro`:
     - Base layout, "Not found" heading, `noindex`.
     - A form `GET` to the base URL with an `<input name="q">` labelled "Search".
     - An `is:inline` script sets `input.value` from the last non-empty path segment (`decodeURIComponent` in try/catch), never as HTML (AC-29).
- **Tests:**
  - `site/e2e/detail.spec.ts`:
    - AC-26: clicking the `alpha:code-review` card opens `/agentic-engineering/plugins/alpha/skills/code-review/`, and a reload keeps it.
    - AC-27, one fixture of each type:
      - skill: body, `reference.md` in the files, install, source link, siblings;
      - agent and command: their bodies;
      - hooks: events and matchers;
      - MCP: `docs-search` and its command.
    - AC-28: the alpha page shows `1.2.0`, MIT, the author and a changelog heading; `output-styles/terse.md` is in its files.
    - Untrusted: the `beta:unsafe-markdown` page fires no dialog and has no `script`, `iframe` or `img` in the body container.
  - `site/e2e/not-found.spec.ts` — AC-29: `/agentic-engineering/plugins/alpha/skills/gone/` returns 404 with the field pre-filled with `gone`; submitting goes to the landing page with `?q=gone`.
- **Acceptance:** every case above passes (AC-26–AC-29).
- **Verify:** `cd site && npm run typecheck` · `cd site && npm run test:e2e -- e2e/detail.spec.ts e2e/not-found.spec.ts`

### T12 — Pages workflow and the request issue form
- **Zone:** ci · **Agent:** main session · **Wave:** 12
- **Covers:** AC-1, AC-2, AC-7, AC-8; AC-17 (the label)
- **Depends on:** T11
- **Skills:** None
- **Owns:** `.github/workflows/pages.yml` (new), `.github/ISSUE_TEMPLATE/artifact-request.yml` (new), `site/test/workflow.test.ts` (new)
- **Reads:** `specs/research/feat-1-catalog-site.md:22-24`
- **Insights:** None
- **Do:**
  1. Triggers and settings in `pages.yml`:
     - `on`: `push` with `branches: [main]`; `pull_request`; `workflow_dispatch` with input `ref` (description "Tag, branch or commit to build and deploy", required, default `main`).
     - Top-level `permissions: contents: read`; `env: ASTRO_TELEMETRY_DISABLED: 1`.
     - `concurrency`: PRs use a group per ref with `cancel-in-progress: true`; deploys use the group `pages` with `cancel-in-progress: false`.
  2. Job `build` (ubuntu-latest, `timeout-minutes: 15`):
     - `actions/checkout` with `ref: ${{ github.event_name == 'workflow_dispatch' && inputs.ref || '' }}` (AC-8).
     - `actions/setup-node` with Node 22, `cache: npm`, `cache-dependency-path: site/package-lock.json`.
     - In `site/`: `npm ci` → `npm run typecheck` → `npm test` → `npm run build` (NFR: under 2 min) → `npx playwright install --with-deps chromium` → `npm run test:e2e`.
     - `actions/upload-pages-artifact` with `path: site/dist` and `if: github.event_name != 'pull_request'`.
  3. Job `deploy` (AC-1; AC-2 because a PR never deploys; AC-7 because a failed build skips deploy and leaves the previous deployment live):
     - `needs: build`, `if: github.event_name != 'pull_request'`.
     - `permissions: { pages: write, id-token: write }`.
     - `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`.
     - `actions/deploy-pages` with `id: deployment`.
  4. Pin every action to a commit SHA with a version comment.
  5. `artifact-request.yml`: name "Request an artifact", `title: "Request: "`, `labels: [request]`; body fields with ids `query`, `filters`, `details`, matching the T6 contract.
- **Tests:** `site/test/workflow.test.ts` parses both YAML files with `yaml`:
  - AC-1: push to `main` triggers the workflow, and `deploy` runs `actions/deploy-pages`.
  - AC-2: `pull_request` is a trigger; the `deploy` and upload conditions exclude PRs.
  - AC-7: `deploy.needs` includes `build`.
  - AC-8: `workflow_dispatch.inputs.ref` exists and the checkout uses it.
  - AC-17: the form has the `request` label and the `query` and `filters` field ids.
  - Every `uses:` is pinned to a 40-character SHA.
- **Acceptance:** the structural checks pass; manual verification for AC-1, AC-2, AC-7 and AC-8 is in T13.
- **Verify:** `cd site && npm run typecheck` · `cd site && npx vitest run test/workflow.test.ts`

### T13 — Integration: docs, quality checks, full gates, manual steps
- **Zone:** repo + site-ui · **Agent:** main session · **Wave:** 13
- **Covers:** integration; NFR; manual verification of AC-1, AC-2, AC-7, AC-8
- **Depends on:** T12
- **Skills:** None
- **Owns:** `docs/catalog-site.md` (new), `docs/releasing.md` (edit, line 8 row), `site/e2e/quality.spec.ts` (new)
- **Reads:** `docs/releasing.md:1-11`
- **Insights:** None
- **Do:**
  1. `docs/catalog-site.md`:
     - What the build reads and the failure and warning rules (AC-5, AC-6).
     - Authoring conventions: `description` is required for skills and agents; `metadata.tags`; safe names.
     - Local commands: `cd site && npm ci && npm run dev | build | test | test:e2e`.
     - `CATALOG_ROOT`.
     - Published URLs (`catalog.json`, `catalog.schema.json`, `llms.txt`).
     - Rollback: Actions → Pages → Run workflow from `main` with `ref` = tag or SHA.
     - The one-time manual setup below.
  2. `docs/releasing.md:8`: point the site row to `docs/catalog-site.md`.
  3. `quality.spec.ts`:
     - axe (WCAG 2.1 AA tags) on the landing page and one detail page has no violations.
     - At a 360 px viewport, `scrollWidth <= clientWidth`.
     - Every request is same-origin.
     - Light and dark color schemes both render (`emulateMedia`).
  4. Full gates (below), then the real empty-marketplace build: `site/dist` has the landing page with the add command, `catalog.json` with zero entries, and `404.html`.
  5. Manual steps for the user, listed in the PR description:
     - a. Settings → Pages → Source: **GitHub Actions**.
     - b. Create the `request` label.
     - c. After the merge to `main`, the footer shows the merge commit (AC-1).
     - d. A test PR shows the "Pages / build" check and the live site is unchanged (AC-2).
     - e. A deliberately broken frontmatter on a branch fails the check; on `main` the live footer stays on the previous commit (AC-7).
     - f. Run workflow with an older SHA or tag; the footer shows that commit (AC-8).
     - g. Open "Request it" from the live site; the issue form opens pre-filled and labelled.
- **Tests:** `site/e2e/quality.spec.ts` — NFR (accessibility, layout, privacy, themes).
- **Acceptance:** all gates are green; the docs are in place; the manual checklist is handed to the user.
- **Verify:** `npm test` (root) · `cd site && npm ci && npm run typecheck && npm test && npm run build && npm run test:e2e`

## Waves
| Wave | Tasks (parallel) | Needs merged before start |
|---|---|---|
| 1 | T1 | — |
| 2 | T2 | T1 |
| 3 | T3 | T1 |
| 4 | T4 | T2, T3 |
| 5 | T5 | T1 |
| 6 | T6 | T4, T5 |
| 7 | T7 | T4, T5, T6 |
| 8 | T8 | T7 |
| 9 | T9 | T8 |
| 10 | T10 | T9 |
| 11 | T11 | T9 |
| 12 | T12 | T11 |
| 13 | T13 | T12 |

## Traceability
| AC | Task(s) | Test(s) | Verify hint |
|---|---|---|---|
| AC-1 | T12, T13 | `site/test/workflow.test.ts` + manual step c | manual |
| AC-2 | T12, T13 | `site/test/workflow.test.ts` + manual step d | manual |
| AC-3 | T2, T4 | `site/src/catalog/build-catalog.test.ts` | integration |
| AC-4 | T4 | `site/src/catalog/build-catalog.test.ts` | integration |
| AC-5 | T4, T7 | `build-catalog.test.ts` (warnings); T7 build output | integration |
| AC-6 | T3, T4, T7 | `frontmatter.test.ts`, `build-catalog.errors.test.ts` | integration |
| AC-7 | T12, T13 | `site/test/workflow.test.ts` (`deploy.needs: build`) + manual step e | manual |
| AC-8 | T12, T13 | `site/test/workflow.test.ts` (dispatch `ref` → checkout) + manual step f | manual |
| AC-9 | T3, T8 | `build-info.test.ts`, `site/e2e/footer.spec.ts` | e2e |
| AC-10 | T5, T10 | `engine.test.ts` (plain text, performance), `site/e2e/search.spec.ts` | e2e |
| AC-11 | T5, T7 | `engine.test.ts`, `test/search-fixture.test.ts` | unit |
| AC-12 | T5 | `engine.test.ts` | unit |
| AC-13 | T5, T7 | `text.test.ts`, `engine.test.ts`, `test/search-fixture.test.ts` | unit |
| AC-14 | T5 | `engine.test.ts` | unit |
| AC-15 | T6, T9 | `browse.test.ts`, `site/e2e/landing.spec.ts` | e2e |
| AC-16 | T10 | `site/e2e/search.spec.ts` | e2e |
| AC-17 | T6, T10, T12 | `request-link.test.ts`, `site/e2e/search.spec.ts`, `workflow.test.ts` (form) + manual step g | e2e |
| AC-18 | T10 | `site/e2e/search.spec.ts` | e2e |
| AC-19 | T9 | `site/e2e/landing.spec.ts` | e2e |
| AC-20 | T9, T11 | `site/e2e/landing.spec.ts` | e2e |
| AC-21 | T9 | `site/e2e/landing.spec.ts` | e2e |
| AC-22 | T9 | `site/e2e/landing.spec.ts` | e2e |
| AC-23 | T6, T10 | `browse.test.ts`, `site/e2e/filters-url.spec.ts` | e2e |
| AC-24 | T6, T10 | `browse.test.ts`, `site/e2e/filters-url.spec.ts` | unit |
| AC-25 | T6, T10 | `url-state.test.ts`, `site/e2e/filters-url.spec.ts` | e2e |
| AC-26 | T4, T11 | `build-catalog.test.ts` (deterministic paths), `site/e2e/detail.spec.ts` | e2e |
| AC-27 | T3, T4, T11 | `markdown.test.ts`, `build-catalog.test.ts`, `site/e2e/detail.spec.ts` | e2e |
| AC-28 | T4, T11 | `build-catalog.test.ts`, `site/e2e/detail.spec.ts` | e2e |
| AC-29 | T11 | `site/e2e/not-found.spec.ts` | e2e |
| AC-30 | T7 | `site/src/catalog/publish.test.ts` (ajv against `catalog.schema.json`) | integration |
| AC-31 | T7 | `site/src/catalog/publish.test.ts` | integration |
| AC-32 | T5, T7 | `engine.test.ts`, `test/search-fixture.test.ts` | unit |
| Untrusted inputs | T3, T10, T11 | `markdown.test.ts`, `search.spec.ts`, `detail.spec.ts` | unit + e2e |
| NFR | T5, T7, T8, T12, T13 | `engine.test.ts` (50 ms), 400 KB budget warning, `quality.spec.ts`, CI build timing | e2e + manual |

## Risks and open questions
- **The repository has no commits.** The existing files must be committed to `main` first; otherwise there is no base for `feat/1-catalog-site`. Until a commit exists, local builds show `unknown` in the footer (T3 warns about it).
- **Pages setup and environment rules.**
  - Pages Source must be switched to "GitHub Actions" by hand, or the first deploy fails.
  - The `github-pages` environment allows only the default branch, so a rollback must be run "Use workflow from: main" with the `ref` input. Running it from another branch is rejected. Documented in T13.
- **Rollback reach.** A rollback can only target refs that already contain `site/`. Older refs fail the build, and the live site stays as it is.
- **400 KB gz budget with 500 artifacts.** Bodies are cut to 4,000 characters in the index and the build warns above the budget. If real content exceeds it, lower `BODY_INDEX_CHARS` or split the index. The catalog is already separate from the index.
- **Ranking assumptions** (AC-13 transpositions, AC-12/AC-14 order, the light stemmer): see Spec feedback. The stemmer can over-merge words (e.g. "news" → "new"). This is acceptable for keyword search; phase 2 adds semantic ranking.
- **Issue-form prefill** through `?query=` and `?filters=` field ids is documented GitHub behaviour but cannot be tested offline. It is checked by hand (step g). If GitHub ignores it, fall back to `body=`.
- **Component discovery limits.** Only top-level `agents/*.md` and `commands/*.md` are read (no nested command namespaces). Plugins with external sources get a plugin-only entry plus a warning. Revisit when the first real plugin uses either.
- **Platform differences.**
  - Symlink fixtures are created during the test run and skipped where symlinks are unavailable (Windows without Developer Mode). CI on Linux always runs them.
  - Astro bundling changes `import.meta.url`, so the repo root comes from `process.cwd()` (see Constraints).
- **Package versions.** Astro and Vitest majors: take the current stable majors at install time and confirm Node 22 support. The lockfile pins them. Dependabot can be added later (not in this spec).
- **Unknowns in `claude plugin validate`.** Does `claude plugin validate .` accept `plugins: []`? Check once locally. If not, keep the skeleton anyway: the catalog build needs it and the empty marketplace is a supported edge case.
- **Fixture marketplace and future checks.** The fixture lives in `site/test/fixtures/`. A future "every `plugins/*` directory is listed" check (`marketplace-setup.md:306-307`) must scan only the root `plugins/`.
- **CI duration.** Unit tests, build and Playwright together take about 3–4 minutes. The 2-minute NFR applies to the catalog build step only. Rollback deploys also run the e2e tests; drop that step for `workflow_dispatch` if rollback speed matters more.

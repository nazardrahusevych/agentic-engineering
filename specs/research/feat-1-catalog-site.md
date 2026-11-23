# Research: catalog site (SPEC-1)

The how, kept out of the spec. Input for planning; nothing here is decided until the plan says so.

## Constraints
- GitHub Pages: static files only, no server, no secrets at runtime. GitHub API from the browser is limited to
  60 unauthenticated requests per hour per IP, so the site makes none (SPEC-1 Non-goals).
- Everything dynamic happens at build time in GitHub Actions; the browser only loads generated files.
- Repository tooling is Node >= 22 without dependencies (`scripts/`); the site may have its own dependencies.

## Approach discussed (2026-11-23)
1. **Build step** (Node script in the repo): read `.claude-plugin/marketplace.json`, each listed plugin's
   `plugin.json`, `skills/*/SKILL.md`, `agents/*.md`, `commands/*.md`, `hooks/hooks.json`, `.mcp.json`,
   `CHANGELOG.md`; parse frontmatter; emit `catalog.json`, a prebuilt search index, `llms.txt`, and one static page
   per artifact (stable URLs, crawlable).
2. **Search**: client-side full-text index built at build time and loaded once. Candidate: MiniSearch (fuzzy and
   prefix matching, per-field boosts, serializable index, small). Alternatives to weigh in the plan: Fuse.js
   (simpler, slower on long bodies), Pagefind (index chunks per page, best for large text, less control over
   cards/facets), FlexSearch.
3. **Site**: static site generator that outputs plain HTML plus a small interactive island for search/filters.
   Candidates: Astro (islands, Markdown rendering, static output) or Vite + a small UI library. Pick in the plan.
4. **Deploy**: `actions/upload-pages-artifact` + `actions/deploy-pages`; triggers `push` to main, `pull_request`
   (build only) and `workflow_dispatch` with a `ref` input (rollback, SPEC-1 AC-8). Pages source must be set to
   "GitHub Actions" in the repository settings.
5. **Sanitizing**: render markdown at build time and sanitize the HTML (e.g. rehype-sanitize or DOMPurify on the
   server side) — SPEC-1 Untrusted inputs.

## Phase 2 notes (semantic search, deferred)
- Embeddings computed at build time with a multilingual model (e.g. `multilingual-e5-small`), stored next to the
  catalog; the query is embedded in the browser with transformers.js and compared by cosine similarity. No
  backend. Costs: model download (~100+ MB first time, cached by the browser) — load it lazily, only when the
  user opts in or the keyword search returns little. Combine scores with the keyword search (hybrid ranking).
- This is why the MVP keeps catalog entries and the search index separate: phase 2 adds a vector file without
  changing the catalog shape.

## Related
- `docs/research/marketplace-setup.md` — marketplace and plugin formats the build step reads.
- `docs/releasing.md` — plugin release/rollback; site rollback is SPEC-1 AC-8.

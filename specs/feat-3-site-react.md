# Spec: Catalog site on React, UI strings, plugin relations, CI jobs | Spec ID: SPEC-3 | Status: done
Supersedes: None
Designs: None

## Problem & why
SPEC-1 shipped the catalog site with Preact islands inside Astro and English text written directly in components.
The maintainer wants React for the UI, all UI text in one file, and a visible, separate build status in GitHub. The
first real plugins (SPEC-2) also bring content the site does not show yet: dependencies between plugins and a
workflow (`retro`).

## Decision: React inside Astro, not a React SPA
| | Astro + React islands (chosen) | React SPA (Vite + router) |
|---|---|---|
| Pages | one static HTML page per artifact, works without JS, crawlable | one HTML shell; content needs JS |
| Deep links on Pages | real files | needs the `404.html` redirect trick |
| JS shipped | React only where interactive (~45 KB gz) | React + router + all UI |
| Existing work | catalog build, pages, 93 unit + 41 e2e tests kept | rewrite pages and most tests |
| React ecosystem | full (`@astrojs/react`) | full |

## Goals / Non-goals
**Goals:**
- Interactive UI in React (replacing Preact) through `@astrojs/react`.
- Every user-visible UI string in one file, `site/src/i18n/en.ts`.
- Plugin dependencies and workflows in the catalog and on the pages.
- Separate GitHub checks for the site: unit, build, e2e, deploy.
- One command to run the dev server from the repository root.

**Non-goals:**
- Other languages than English (the file makes them possible later).
- Agent metadata (model, tools) on cards.
- Executing workflow files at build time (they are read as text only).

## Acceptance criteria (EARS)
UI
- **AC-1** — The site's interactive components SHALL be React components; Preact SHALL NOT be a dependency.
  *Verify:* integration — `site/package.json` has `react`, `react-dom`, `@astrojs/react` and no `preact`;
  all SPEC-1 e2e tests pass.
- **AC-2** — Every user-visible UI string (labels, buttons, messages, headings, page titles) SHALL come from
  `site/src/i18n/en.ts`; components and pages SHALL contain no literal UI text.
  *Verify:* unit — a scan of `.tsx` / `.astro` files finds no literal text between tags or in `aria-label`,
  `placeholder`, `title`; e2e — changing a string in the file changes the page.
- **AC-3** — Strings with values (counts, names) SHALL be functions or templates in the same file, not
  concatenated in components.
  *Verify:* unit.

Catalog
- **AC-4** — Each plugin entry SHALL list its dependencies (`dependencies`: plugin ids) in `catalog.json`, and the
  plugin page SHALL show "Depends on" and "Used by" with links.
  *Verify:* integration + e2e — `architecture-review` shows `engineering-paved-path` and vice versa.
- **AC-5** — The catalog SHALL contain one entry of type `workflow` per file in a plugin's `workflows/` (or the
  manifest's `workflows` paths), named and described from its `export const meta = { name, description }`.
  *Verify:* integration — a fixture workflow becomes an entry.
- **AC-6** — IF a workflow file has no literal `meta` with `name` and `description`, THEN the build SHALL fail with
  the path and reason. The file SHALL never be executed or imported.
  *Verify:* integration.
- **AC-7** — A workflow detail page SHALL show its description, phases (when `meta.phases` is given), the run
  command `/<plugin>:<name>` and the source as text.
  *Verify:* e2e.
- **AC-8** — `catalog.schema.json` SHALL describe `dependencies` and the `workflow` type; `schemaVersion` SHALL stay
  `1` (additive change).
  *Verify:* integration — ajv validation.

CI and local development
- **AC-9** — The site workflow SHALL have separate jobs, shown as separate checks: `site-unit` (typecheck + Vitest),
  `site-build`, `site-e2e` and `deploy`; `deploy` SHALL need all three and run only for `main` and manual runs.
  *Verify:* unit — the workflow test; manual — a PR shows three site checks.
- **AC-10** — The site workflow SHALL be separate from the repository `Validate` workflow (SPEC-2 AC-15).
  *Verify:* manual.
- **AC-11** — WHEN the maintainer runs `npm run site:dev` at the repository root, the system SHALL start the Astro
  dev server for `site/` with the real marketplace; the root `package.json` SHALL stay without dependencies.
  *Verify:* manual.

## Edge cases
- A dependency names a plugin that is not in the marketplace → shown as text without a link, build warning.
- A cross-marketplace dependency (`name@other`) → shown as text, no link.
- A workflow file with a dynamic `meta` (not literal) → AC-6 failure.

## How indexing works (for the README)
There is no separate index to maintain. Every push to `main` rebuilds the catalog and the search index from the
repository in GitHub Actions; a new plugin, skill, agent or workflow appears once it is merged and its plugin is
listed in `marketplace.json`. Pull requests run the same build as a check.

## Untrusted inputs
Workflow source is shown as escaped text; `meta` is parsed from the file text with a literal-only parser.

## [NEEDS CLARIFICATION]
None.

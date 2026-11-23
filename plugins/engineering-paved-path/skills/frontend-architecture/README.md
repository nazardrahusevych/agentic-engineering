# frontend-architecture

**Version:** 1.0.0 · [Version history](#version-history)

A skill for agents (Claude Code, Codex) about **frontend UI architecture and code organization** in React and
Next.js App Router codebases: where code lives, how the codebase splits into layers, which imports are allowed, where
the server/client boundary goes and where business logic and data access belong.

This README is for humans. Agents load `SKILL.md` (and, on demand, one file from `references/`); they never read this
file, so it can be as long as it needs to be.

## Focus

The skill answers "**where does this go, and who may import it?**" — not "how do I write this component". It is meant
to be the single source for structural decisions, so other skills don't have to repeat them and don't contradict them.

## What it covers

- Folder layout: the three homes for code (route `_components` → `features/<domain>` → shared), with feature,
  route, component and shared-layer anatomy.
- Import direction (shared → features → app), no cross-feature imports, composing features in routes.
- The promotion/demotion rule for moving code between homes.
- Next.js App Router boundaries: thin Server Component pages, `'use client'` placement, `server-only` modules,
  providers, Server Actions vs client mutations, Route Handlers, env variables, the three data-handling models.
- Layers for logic and data: component → view-model hook → `model/` business rules → `api/` (requests, DTO mapping,
  query key factories, `queryOptions`, query/mutation hooks); state by kind.
- Conventions: constants, helpers vs utils vs lib vs model, types, file and folder naming, exports, `index.ts` files,
  imports.
- Enforcement: a tested ESLint flat config for import zones, cycles, `export *` and naming.
- Three workflows with checklists: placing new code, reviewing a diff for architecture, restructuring existing code.

## What it does not cover

| Topic | Where it lives |
|---|---|
| Component internals: purity, hooks, effects, memoization, keys, conditional rendering, accessibility | `react-best-practices` |
| Next.js API details: file conventions reference, RSC errors, async APIs, metadata, images, fonts, bundling | `next-best-practices` |
| Performance: bundle size, re-renders, barrel-file build cost | `react-best-practices`, `next-best-practices` |
| How to write tests | `react-testing-library` |
| Auth, authorization and data-exposure rules | `security` |
| Writing schemas | `zod` |
| Type-level design, tsconfig | `typescript-expert` |

## Use cases

The skill is designed for these situations (examples of prompts that should trigger it):

- **New feature or page:** "Add a Teams area with a list page, a detail page and a badge that also shows on the
  projects page — where do the files go?"
- **Placing a single piece:** "Where should the query keys for reviews live?", "Is this a helper or a util?",
  "Should this constant go into a constants file?"
- **Architecture review:** "Review this PR for structure and layering problems."
- **Restructuring:** "Our `components/` folder mixes generic and domain components — propose a target structure and a
  migration order."
- **Next.js boundaries:** "We're adding our own DB table next to the external API — where do the DB client, data
  access functions and the Server Action go?"
- **Tooling:** "Set up lint rules so features can't import each other."

## How it is organized

```
frontend-architecture/
├── SKILL.md                     # loaded when the skill triggers: model, placement table, workflows, pointers
├── README.md                    # this file (humans only)
├── references/                  # loaded one at a time, only when the task needs it
│   ├── folder-structure.md      # layouts, anatomy, import matrix, promotion examples, scaling, anti-patterns
│   ├── nextjs-boundaries.md     # data-handling models, pages, 'use client', server-only, providers, actions, handlers
│   ├── logic-and-data.md        # layers, API layer, key factories, model/, view-model hooks, state by kind
│   ├── conventions.md           # constants, helpers/utils/lib/model, types, naming, exports, index files, imports
│   └── enforcement.md           # tested ESLint flat config and rollout
└── evals/                       # humans only: evaluation prompts and the fixture app they run against
    ├── evals.json               # 4 prompts with expectations
    └── fixture/                 # "Trackly", a deliberately messy Next.js app + pr.diff with planted problems
```

Design follows Anthropic's skill-authoring guidance: a short `SKILL.md` (under 500 lines), progressive disclosure
through references one level deep, a table of contents in each reference file, a description written in third
person that says both what the skill does and when to use it, and no time-sensitive statements in agent-facing files.

**Project conventions win.** The skill is generic. A project's `AGENTS.md` (or `CLAUDE.md`) overrides its defaults;
the skill never asks an agent to migrate code it wasn't asked to touch.

## Related skills

| Skill | Scope | Difference from this skill |
|---|---|---|
| `react-best-practices` | How to write React components and hooks | Works *inside* a file; this skill decides which file and folder. Its "Code Organization" section points here |
| `next-best-practices` | Next.js APIs and conventions | Describes how each Next.js feature works; this skill decides how they shape the code layout (thin pages, server-only layer, where actions live) |
| `typescript-expert` | TypeScript language and tooling | This skill only says where types live and how path aliases are used |
| `react-testing-library` | Writing component and hook tests | This skill only says tests sit next to the code |
| `security` | OWASP rules, auth, data exposure | This skill only places the server-only layer where those rules are applied |
| `zod` | Schema authoring | This skill only says schemas live in `api/` (responses) or next to forms/`model/` |
| `engineering-insights` | Recording project-specific lessons | Project-specific structure decisions go to `AGENTS.md`/`INSIGHTS.md`, not into this generic skill |

## Default decisions and why

Sources disagree on several points. These are the defaults chosen for version 1.0.0; each can be overridden by a
project convention.

| Topic | Default | Alternatives considered | Main sources |
|---|---|---|---|
| Top-level structure | Three homes: route `_components` → `features/<domain>` → shared; imports flow shared → features → app | Route colocation + shared only (simpler, mixes domain into shared); full Feature-Sliced Design (strict, heavy) | Bulletproof React, Robin Wieruch, Next.js project-structure docs, FSD |
| Data layer | Per domain in `features/<domain>/api/`: request functions, DTO mapping, key factory + `queryOptions`, hooks; only the API client is in `lib/` | One global `lib/hooks/` layer; hooks colocated in routes | Bulletproof API layer, TkDodo, Next.js TanStack Query guide |
| `index.ts` | Allowed only as a thin forwarder with explicit named re-exports; no `export *`, no multi-folder barrels | No index files at all; mandatory public API per folder | TkDodo barrel files, Bulletproof, Josh Comeau, Robin Wieruch, FSD public API |
| Pages | `page.tsx` is a thin Server Component; `'use client'` starts at the view it renders | `'use client'` pages for SPA-style apps; no default | Next.js server/client components and boundary guides |
| File naming | Follow the project; otherwise PascalCase component files and folders, kebab-case everything else | kebab-case everywhere; no default | Airbnb, Josh Comeau, Bulletproof, eslint-plugin-check-file |
| helpers vs utils | Scope-based: `helpers.ts` is local to a component/route, `model/` holds feature business rules, `utils/<topic>.ts` is shared by 2+ features, `lib/` holds configured instances | Josh Comeau's split by genericity (utils = project-agnostic, helpers = project-specific) | Josh Comeau, Robin Wieruch, Go blog on package names, Kent C. Dodds colocation |

## Sources

All sources used to research and build the skill (researched 2026-10-16). Kept here as a permanent record so the
skill can be re-checked and extended later.

### Next.js (official)

- [Project Structure and Organization](https://nextjs.org/docs/app/getting-started/project-structure) — Next.js is unopinionated; colocation in `app/`, private `_folders`, route groups, three layout strategies.
- [`src` folder](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder) — separates app code from config files.
- [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — organize routes and layouts without changing URLs.
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — `'use client'` on leaves, slots, providers deep, `server-only`/`client-only`.
- [The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) — code crosses via imports, data via serializable props; wrappers; compound components across the boundary.
- [Single-Page Applications](https://nextjs.org/docs/app/guides/single-page-applications) — SPA patterns on the App Router, promises through context, browser-only components.
- [Client-side data fetching](https://nextjs.org/docs/app/guides/client-side-data-fetching) — inline, Suspense and server-provided patterns; cache layers.
- [Client-side data fetching with TanStack Query](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query) — providers per layout, shared "cache contract" for keys and options.
- [Data Security](https://nextjs.org/docs/app/guides/data-security) — choose one data-handling model; Data Access Layer with DTOs; audit checklist.
- [How to Think About Security in Next.js (blog)](https://nextjs.org/blog/security-nextjs-server-components-actions) — origin of the three data-handling models and the DAL.
- [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data) — where Server Functions are defined and how clients import them.
- [Server Actions guide](https://nextjs.org/docs/app/guides/server-actions) — security, sequential dispatch, caching integration.
- [Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) — Route Handlers for proxying and webhooks; don't fetch your own handlers from Server Components.
- [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) — server fetching and streaming.
- [Next.js Learn: Dashboard App](https://nextjs.org/learn/dashboard-app/getting-started) — official tutorial layout (`app/lib`, `app/ui`).
- [next-spa-patterns](https://github.com/nextjs/next-spa-patterns) — reference repo for the SPA and client fetching guides.

### Reference architectures

- [Bulletproof React — Next.js app](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app) — `app/` routes with `_components` composing `features/<domain>/{api,components}`.
- [Feature-Sliced Design with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) — `app/` at root, FSD layers in `src/`, `_app`/`_pages`, `index.server.ts`.
- [create-t3-app folder structure (App Router)](https://create.t3.gg/en/folder-structure-app) — hard split between `src/app` and server-only `src/server`.
- [TanStack Query — Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) — query client per request, providers file, prefetch + `HydrationBoundary`.
- [next-intl — App Router setup](https://next-intl.dev/docs/getting-started/app-router) — `messages/` and `src/i18n/request.ts`.
- [shadcn/ui — components.json](https://ui.shadcn.com/docs/components-json) — de facto `components/ui`, `lib/utils`, `hooks` aliases.
- [Wisp: Organizing a Next.js 15 project](https://www.wisp.blog/blog/the-ultimate-guide-to-organizing-your-nextjs-15-project-structure) — community guide; `components/ui|layout|features`, `lib` vs `utils`.

### Project structure (general React)

- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — `features/`, shared folders, shared → features → app, no cross-feature imports, no barrels.
- [Bulletproof React — Project Standards](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) — `@/` alias, kebab-case enforced by check-file, lint/format/typecheck hooks.
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — layers, slices, segments, import rule.
- [Feature-Sliced Design — Layers](https://feature-sliced.design/docs/reference/layers) — purpose of each layer.
- [Feature-Sliced Design — Slices and segments](https://feature-sliced.design/docs/reference/slices-segments) — segment names describe purpose, not essence.
- [Feature-Sliced Design — Public API](https://feature-sliced.design/docs/reference/public-api) — import slices only through their public API.
- [Robin Wieruch — React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/) — grow structure step by step; promotion rule; deletion test.
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) — component folders with `.helpers`/`.constants`; utils vs helpers; group by function.
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — place code as close as possible to where it's relevant.
- [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) — group by module, wrap external components, helpers outside components.
- [React legacy docs — File Structure](https://legacy.reactjs.org/docs/faq-structure.html) — no official opinion; avoid deep nesting; don't overthink it.
- [Dan Abramov — react-file-structure.surge.sh](https://react-file-structure.surge.sh/) — move files around until it feels right.
- [Robert C. Martin — Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) — structure should show what the app does.
- [Brad Frost — Atomic Design, ch. 2](https://atomicdesign.bradfrost.com/chapter-2/) — atoms to pages; an example, not a rule.

### Business logic and data layer

- [Juntao Qiu — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) — view, view model, domain and gateway layers.
- [Juntao Qiu — Headless Component](https://martinfowler.com/articles/headless-component.html) — logic in hooks, visuals in props-only components.
- Johannes Kettmann — Path To A Clean(er) React Architecture (series; canonical on profy.dev, which was unreachable during research; dev.to copies by the author):
  - [Part 1: A Shared API Client](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-a-shared-api-client-2d4p)
  - [Part 2: API Layer & Fetch Functions](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-fetch-functions-4jin) · [profy.dev](https://profy.dev/article/react-architecture-api-layer-and-fetch-functions)
  - [Part 3: API Layer & Data Transformations](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-data-transformations-1go0) · [profy.dev](https://profy.dev/article/react-architecture-api-layer-and-data-transformations)
  - [Part 4: Domain Entities & DTOs](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0) · [profy.dev](https://profy.dev/article/react-architecture-domain-entities-and-dtos)
  - [Part 5: Infrastructure Services & Dependency Injection](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-5-infrastructure-services-dependency-injection-for-testability-586j)
  - [Part 6: Business Logic Separation](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g)
  - [Part 7: Domain Logic](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg)
  - [Part 8: How Does React-Query Fit Into The Picture?](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-8-how-does-react-query-fit-into-the-picture-1b99)
- [Bulletproof React — API Layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) — one client; requests per feature with types, fetcher and hook.
- [Bulletproof React — State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) — component, application, server cache, form and URL state.
- [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) — server state ≠ client state; custom hooks per query.
- [TkDodo — Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) — key factory per feature; no global keys file.
- [TkDodo — The Query Options API](https://tkdodo.eu/blog/the-query-options-api) — `queryOptions` as the unit of reuse.
- [TkDodo — Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) — prefer `queryOptions` over hook-only abstractions.
- [TkDodo — You Might Not Need React Query](https://tkdodo.eu/blog/you-might-not-need-react-query) — when framework data fetching is enough.
- [React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) — only functions that call hooks are hooks; use-case-named hooks.
- [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) — keep state close; server cache is not app state.
- [Kent C. Dodds — State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — colocated state is easier to maintain and faster.

### Component boundaries

- [React — Thinking in React](https://react.dev/learn/thinking-in-react) — one concern per component; state in the closest common owner.
- [Kent C. Dodds — When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) — split when a real problem appears.
- [Nadia Makarevich — Components composition: how to get it right](https://www.developerway.com/posts/components-composition-how-to-get-it-right) — implement or compose, not both.
- [patterns.dev — Container/Presentational](https://www.patterns.dev/react/presentational-container-pattern/) — hooks usually replace containers.
- [patterns.dev — Hooks pattern](https://www.patterns.dev/react/hooks-pattern) and [Compound pattern](https://www.patterns.dev/react/compound-pattern).
- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — the original split and its later update (Medium blocks scripted fetches; open in a browser).
- [Bulletproof React — Components and Styling](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md) — no nested render functions; wrap third-party components.

### Conventions and abstraction

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) — `CONSTANT_CASE` only at module level; named exports; no mutable exports.
- [Matt Pocock — Where to put your types](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) — colocate single-use types; shared types at the narrowest common level.
- [The Go Blog — Package names](https://go.dev/blog/package-names) — `util`/`common`/`misc` say nothing; split by content.
- [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) — PascalCase component files; filename = component name.
- [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) — avoid hasty abstractions.
- [Sandi Metz — The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) — duplication is cheaper than the wrong abstraction.
- [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) — barrels hide structure and cause cycles; keep them for package entries.

### Enforcement tooling

- [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) — import zones.
- [`import/no-cycle`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md) — circular imports.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — element types and allowed dependencies.
- [Steiger](https://github.com/feature-sliced/steiger) — FSD architecture linter.
- [eslint-plugin-check-file](https://github.com/dukeluo/eslint-plugin-check-file) — file and folder naming, Next.js App Router case.
- [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) — single filename case.
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — module graph rules in CI.
- [Knip](https://knip.dev/) — unused files, exports and dependencies.

### Out of scope, kept for reference

Performance:

- [Marvin Hagemeister — The barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/)
- [Atlassian — 75% faster builds by removing barrel files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files)
- [Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [Next.js — `optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
- [Vercel — react-best-practices agent skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) (performance rules; also an example of a rule-per-file skill format)

Component-level coding (covered by `react-best-practices`):

- [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
- [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
- [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [Rules of React](https://react.dev/reference/rules)

### Skill authoring

- [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — concise SKILL.md, progressive disclosure, descriptions, evaluations.
- [Agent Skills specification](https://agentskills.io/specification) — frontmatter fields (`metadata.version`), directory layout, file references.

## Evaluation

`evals/evals.json` holds four realistic prompts that run against the fixture app in `evals/fixture/`:

| Eval | Checks |
|---|---|
| `teams-feature-placement` | Placing a new feature: thin pages, feature api layer, cross-feature composition, route-only UI |
| `pr-architecture-review` | Finding the structural problems planted in `fixture/pr.diff` and where each piece should go |
| `restructure-messy-components` | Target tree and incremental migration for the fixture's mixed `components/`, `utils.ts`, `constants.ts` and hooks barrel |
| `own-db-table-placement` | Adding a DB-backed area: server-only layer, DAL authorization, Server Action, universal schema |

**How to run:** copy `evals/fixture/` to a scratch folder outside the repo; for each prompt run one agent that reads
this skill and one that is told not to use it; save each answer; grade every expectation with quoted evidence; compare
pass rates. Agents must not modify the fixture (hash it before and after).

**Results** (one run per configuration, claude-opus-5-5). Iteration 1 ran the first draft; after it the skill was
changed (authorization placement for Server Actions and the DAL made explicit, `server-only` exception for ORM
schemas, reviews separate new from pre-existing problems, per-workflow reference hints) and the expectations were
tightened. Iteration 1 answers were then re-graded with the tightened expectations so both iterations use one scale:

| | teams | pr-review | restructure | own-db | Total | Mean time | Mean tokens |
|---|---|---|---|---|---|---|---|
| Iteration 1, with skill | 10/10 | 12/12 | 10/10 | 8/9 | 40/41 (98%) | 331 s | ~120k |
| Iteration 1, without skill | 7/10 | 9/12 | 8/10 | 7/9 | 31/41 (76%) | 209 s | ~84k |
| Iteration 2, with skill | 10/10 | 12/12 | 9/10 | 9/9 | 40/41 (98%) | 318 s | ~119k |
| Iteration 2, without skill | 7/10 | 9/12 | 8/10 | 7/9 | 31/41 (76%) | 212 s | ~83k |

- **What the skill changes:** without it, agents keep `'use client'` pages, put single-route UI into feature folders
  by domain, send data access back to a global `lib/hooks`, let data-access functions accept a caller-supplied
  `userId`, and don't record a mixed data-handling model. With it, those failures disappear.
- **Iteration 2 fix confirmed:** the Server Action session check (own-db 8/9 → 9/9).
- **Iteration 2 restructure miss was an expectation bug:** the answer kept `STATUS_LABELS` next to its only consumer,
  which is what the skill's promotion rule asks for; the expectation has since been corrected.
- **Cost not reduced:** the per-workflow reference hints barely changed reading (agents still opened 3–5 references);
  the skill costs about +50% time and +42% tokens per task. Trimming references is the next lever if cost matters.

## Version history

The version lives in two places that must change together: `metadata.version` in `SKILL.md` frontmatter (read by
tools) and this section (read by people).

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-10-19 | Initial version: three-homes model, placement table, three workflows, five references, tested ESLint config, evaluation set; includes fixes from evaluation iteration 1 |

### Versioning policy

Semantic versioning, judged by the effect on an agent's output:

- **Major** — a default or rule changes so that previously correct output becomes wrong (e.g. switching the
  `index.ts` default, renaming the three homes).
- **Minor** — new guidance that doesn't contradict existing guidance (a new reference file, a new placement row,
  a new workflow).
- **Patch** — wording, examples, links, typo fixes.

### Updating the skill

1. Change `SKILL.md` or a reference file; keep `SKILL.md` under 500 lines and references one level deep.
2. Bump `metadata.version` and add a row to the table above.
3. If a default changed, update "Default decisions and why".
4. Re-run the evaluation prompts (with and without the skill) and compare before merging.
5. Re-check links in this README.

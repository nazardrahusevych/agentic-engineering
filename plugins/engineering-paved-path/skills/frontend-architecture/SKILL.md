---
name: frontend-architecture
description: Frontend architecture and code organization for React and Next.js App Router apps — where pages, components, hooks, constants, helpers and utils, types, API calls, query keys, Server Actions and server-only code live; how to split a codebase into route, feature and shared layers; import direction between them; server/client boundaries; and where business logic goes. Use when creating a page, feature or new file, deciding where code belongs, extracting shared code, restructuring folders, or reviewing a diff for structure and layering — and whenever the user asks about project structure, folder layout, feature folders, colocation, utils vs helpers, constants files, barrel/index files or separating business logic from components, even if they never say "architecture". Not for component-level coding rules or performance (see react-best-practices and next-best-practices).
metadata:
  version: "1.0.0"
---

# Frontend architecture

Decides **where code lives and who may import whom** in a React + Next.js App Router codebase. It does not cover
how to write a component's internals (hooks, effects, memoization, keys) or performance — those belong to
`react-best-practices` and `next-best-practices`.

## Project conventions come first

Before placing or moving anything, read the package's `AGENTS.md` / `CLAUDE.md` and look at how existing code is laid
out. Everything below is a **default for gaps**, not a mandate to migrate:

- If the project already decided something (folder names, file naming, index files, where hooks live), follow it.
- Don't restructure code you weren't asked to touch. Mention a conflict with these defaults only in a review or
  when the user asks about structure.
- New code in a new area follows these defaults unless the project says otherwise.

## The model: three homes, one direction

```
src/
├── app/                      # routing layer: thin pages/layouts + route-only code
│   └── reviews/[reviewId]/
│       ├── page.tsx          # Server Component: read params, render one view
│       └── _components/      # UI used only by this route
├── features/                 # domain code reused across routes
│   └── reviews/
│       ├── api/              # requests, DTO mapping, query keys/options, query hooks
│       ├── components/       # domain UI used by 2+ routes
│       ├── hooks/            # domain view-model hooks (UI state + orchestration)
│       ├── model/            # business rules: pure TS, no React, no I/O
│       ├── constants.ts
│       └── types.ts
├── components/               # domain-free UI (primitives, layout shells)
├── hooks/                    # domain-free hooks
├── lib/                      # configured clients and infrastructure (api client, query client, i18n)
├── utils/                    # pure functions shared by 2+ features, one file per topic
├── types/                    # types shared by 2+ features
├── config/                   # env access, app-wide constants, feature flags
└── server/                   # only if the app has its own backend code: server-only modules
```

**Imports flow one way: shared (`components`, `hooks`, `lib`, `utils`, `types`, `config`) → `features` → `app`.**
A feature never imports another feature; shared code never imports features or routes.

Why: a change to one domain stays inside one folder; deleting a feature breaks only the routes that compose it;
shared code stays reusable because it knows nothing about domains.

**Promotion rule:** start code at the most local home (component → route → feature) and move it one level down only
when a second consumer appears in another place. Move it back up when it drops to one consumer. Don't create a shared
module "because someone may reuse it".

**Cross-feature needs:** when feature A wants something from feature B, don't import across. Either compose them in
the route (`app/` renders both and passes data or elements as props/`children`), or move the shared piece down to the
shared layer.

## Where does this code go?

| Code | Default home | Notes |
|---|---|---|
| Page / layout | `app/<route>/page.tsx`, `layout.tsx` | Thin Server Component; no business logic, no data mapping |
| UI used by one route | `app/<route>/_components/<Name>/` | `_` keeps it out of routing |
| Domain UI used by 2+ routes | `features/<domain>/components/<Name>/` | |
| Domain-free UI (button, modal, shell) | `components/<Name>/` or the design-system package | Must not import features |
| Private sub-component | Inside the parent's folder (file, or `_components/<Sub>/` if it needs its own files) | |
| Hook used by one component | That component's folder | |
| Domain view-model hook | `features/<domain>/hooks/` | Combines data hooks + UI state |
| Server data access (request fn, DTO mapping, query keys/options, query & mutation hooks) | `features/<domain>/api/` | Never `fetch` inside components |
| API client, query client, providers' setup | `lib/` | One configured instance each |
| Business rule (pure) | `features/<domain>/model/` | Testable without rendering |
| Pure function for one component/route | `helpers.ts` next to it | "helper" = local scope |
| Pure function shared by 2+ features | `utils/<topic>.ts` | "util" = shared scope; no catch-all `utils.ts` |
| Constant | Module level in the file → `constants.ts` next to it → `features/<domain>/constants.ts` → `config/` | Most local home that covers all users |
| Type | Same file → `types.ts` in folder/feature → `types/` | Contract types from a shared package are re-exported, not copied |
| Server Action | `actions.ts` with `'use server'` in the route or `features/<domain>/api/` | Thin: validate, check the session, delegate to a data-access function that authorizes the current user itself |
| DB / secrets / server-only data access | `server/` with `import 'server-only'` | Only if the app talks to a DB or secret-backed service itself |
| Route Handler | `app/api/**/route.ts` | Only for BFF, proxy, webhooks, non-UI responses |
| Context provider stack | `app/providers.tsx` (`'use client'`) rendered from the nearest layout | Domain context lives in its feature |
| Unit / component test | Next to the file it tests | E2E tests in a separate root folder |

Details and edge cases: [references/folder-structure.md](references/folder-structure.md).

## Workflow A — placing new code

```
- [ ] 1. Read project conventions (AGENTS.md, existing folders) and note any that override these defaults
- [ ] 2. List every new piece (route, components, hooks, requests, rules, constants, types) and pick its home from the table
- [ ] 3. Start local; promote only pieces that already have 2+ consumers
- [ ] 4. Check each new import against the one-way direction and the no-cross-feature rule
- [ ] 5. Keep page.tsx a thin Server Component; put 'use client' on the view it renders — also for an existing page you rewrite
- [ ] 6. Put server data access in features/<domain>/api (keys/options + hooks), not in components
- [ ] 7. Typecheck; run the boundary lint rules if the project has them
```

When presenting a plan, list each file path with a one-line purpose, then show code only for the parts that carry
architectural decisions (data layer, boundaries, composition).

## Workflow B — reviewing a diff for architecture

Check only structure and layering; leave component-level style and performance to `react-best-practices`. For each
finding give the file, what is wrong, why it matters, and where the code should move. Report problems the diff
introduces separately from problems that already existed, so the author knows what blocks this change.

| Severity | Look for |
|---|---|
| High | A feature importing another feature, or shared code importing a feature/route |
| High | Server-only code (DB client, secrets, non-`NEXT_PUBLIC_` env) reachable from a client module or outside `server/` |
| High | `fetch`/API calls inside components, or request logic outside the domain's `api/` |
| High | A Server Action without a session check, or a data-access function that trusts a caller-supplied user id instead of resolving the current user |
| Medium | Business rules computed inside component bodies or JSX instead of `model/` or hooks |
| Medium | `'use client'` on a page or layout, or on a large subtree that only needs it on a leaf |
| Medium | `export *` or a barrel that aggregates several folders; importing another component's internals |
| Medium | DTO/API response shapes leaking into components instead of mapped domain types |
| Low | A new shared module with a single consumer; a catch-all `utils.ts`/`common`/`misc` |
| Low | Static constants declared inside a component body; magic values repeated across files |
| Low | Deep `../../..` imports across folders instead of the `@/` alias |

## Workflow C — restructuring existing code

Move in small, behavior-preserving steps, one domain at a time; never a big-bang rewrite.

```
- [ ] 1. Map the current tree: for each folder, which domains and which consumers it serves
- [ ] 2. Write the target tree using the three homes; keep project conventions that don't conflict
- [ ] 3. Order the moves: shared primitives first, then one feature per step, routes last
- [ ] 4. Per step: move files, update imports (keep public names), typecheck and run tests
- [ ] 5. Split catch-all modules (utils.ts, constants.ts, hooks/index.ts) by consumer as their users move
- [ ] 6. Add boundary lint rules as warnings, fix, then switch to errors
```

## References

Read only the files the task needs. Typical picks: Workflow A → `folder-structure.md` and `logic-and-data.md`
(plus `nextjs-boundaries.md` when server code, Server Actions or env vars are involved); Workflow B → this file is
usually enough, open a reference only to confirm a specific rule; Workflow C → `folder-structure.md` and
`conventions.md` (plus `enforcement.md` for the lint step).

- **Folder layout in depth** (feature/route/component anatomy, import matrix, promotion examples, scaling to FSD
  or a monorepo, anti-patterns) → [references/folder-structure.md](references/folder-structure.md)
- **Next.js server/client boundaries** (data-handling models, thin pages, `'use client'` placement, `server-only`,
  providers, Server Actions, Route Handlers, env vars) → [references/nextjs-boundaries.md](references/nextjs-boundaries.md)
- **Business logic and data layer** (component → hook → model → api, query keys/options, DTO mapping, state by kind)
  → [references/logic-and-data.md](references/logic-and-data.md)
- **Conventions** (constants, helpers vs utils vs lib, types, file naming, index files, imports)
  → [references/conventions.md](references/conventions.md)
- **Enforcing it with tooling** (ESLint import zones, cycles, naming, `export *`, unused code)
  → [references/enforcement.md](references/enforcement.md)

## Related skills

- `react-best-practices` — inside a component: purity, hooks, effects, memoization, keys, conditional rendering.
- `next-best-practices` — Next.js APIs: file conventions, RSC errors, async APIs, metadata, images, fonts, bundling.
- `typescript-expert` — type-level design, tsconfig and path aliases.
- `react-testing-library` — how to write tests (this skill only says where they live).
- `security` — auth and data-exposure rules behind the server-only layer.
- `zod` — how to write schemas (this skill only says where they live).

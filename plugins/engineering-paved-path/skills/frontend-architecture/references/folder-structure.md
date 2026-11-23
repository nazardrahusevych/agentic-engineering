# Folder structure in depth

## Contents
- Full target layout
- Route folder anatomy
- Feature folder anatomy
- Component folder anatomy
- Shared layer anatomy
- Import matrix
- Promotion and demotion, with examples
- Composing features instead of importing across them
- Route groups and private folders
- Nesting depth
- Scaling up: entities layer, FSD, monorepo
- Anti-patterns

## Full target layout

```
<package root>/
├── messages/ · public/ · next.config.ts · tsconfig.json   # framework and config files
└── src/
    ├── app/                         # routing layer (Next.js App Router)
    │   ├── layout.tsx               # root layout, renders <Providers>
    │   ├── providers.tsx            # 'use client' provider stack
    │   ├── (dashboard)/             # route group: shared layout, no URL segment
    │   │   └── reviews/
    │   │       ├── page.tsx
    │   │       └── [reviewId]/
    │   │           ├── page.tsx
    │   │           ├── loading.tsx · error.tsx
    │   │           ├── actions.ts   # 'use server', only if this route mutates via Server Actions
    │   │           └── _components/
    │   │               └── ReviewView/
    │   └── api/                     # Route Handlers (BFF/proxy/webhooks only)
    ├── features/
    │   └── <domain>/                # e.g. reviews, agents, repos
    │       ├── api/
    │       ├── components/
    │       ├── hooks/
    │       ├── model/
    │       ├── constants.ts
    │       ├── types.ts
    │       └── index.ts             # optional public API (thin forwarder)
    ├── components/                  # domain-free UI
    │   ├── ui/                      # primitives, if no separate design-system package
    │   └── layout/                  # app shell, page frame
    ├── hooks/                       # domain-free hooks (useMediaQuery, useDebouncedValue)
    ├── lib/                         # api-client.ts, query-client.ts, i18n, analytics
    ├── utils/                       # date.ts, currency.ts, … (pure, shared)
    ├── types/                       # shared types, contract re-exports
    ├── config/                      # env.ts, constants.ts, flags.ts
    ├── server/                      # server-only: db, data access, auth (only with own backend code)
    └── test/                        # test setup, factories, MSW handlers
```

Folders that would be empty are not created. A small app may have only `app/`, `components/`, `lib/` and one or two
features.

## Route folder anatomy

A route folder owns the URL and composition, nothing else.

| File | Purpose |
|---|---|
| `page.tsx` | Server Component. Awaits `params`/`searchParams`, renders one view component, optionally prefetches data |
| `layout.tsx` | Shared frame for child routes; renders providers that only this subtree needs |
| `loading.tsx`, `error.tsx`, `not-found.tsx` | Route-level states |
| `_components/<Name>/` | UI used only by this route (including the client "view" the page renders) |
| `actions.ts` | Server Actions used only by this route |
| `constants.ts`, `helpers.ts` | Values and pure functions used only by this route |

```tsx
// app/(dashboard)/reviews/[reviewId]/page.tsx
import { ReviewView } from "./_components/ReviewView";

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return <ReviewView reviewId={reviewId} />;
}
```

## Feature folder anatomy

A feature is a business domain used by more than one route. Name it after the domain (`reviews`, `billing`), singular
or plural consistently, never after a screen (`review-page`) or a technical role (`modals`).

| Path | Holds | Must not |
|---|---|---|
| `api/` | Request functions, response schemas, DTO → domain mapping, query key factory + `queryOptions`, query/mutation hooks | Render UI |
| `components/` | Domain UI reused across routes | Fetch directly; import other features |
| `hooks/` | View-model hooks: combine data hooks with UI state, return what a view renders | Contain raw `fetch` |
| `model/` | Business rules as pure functions/classes, domain types and invariants | Import React or perform I/O |
| `constants.ts` | Domain constants (limits, enum-like maps, labels keys) | Hold route-only values |
| `types.ts` | Domain types used across the feature | Duplicate shared contract types |
| `index.ts` | Optional public API: explicit named re-exports of what routes may use | Use `export *` |

Inside a feature, files may import each other freely (`components` → `hooks` → `api`/`model`). Outside a feature,
import only what it exposes (its `index.ts` if present, otherwise the specific file).

## Component folder anatomy

```
ReviewSummary/
├── ReviewSummary.tsx          # the component (named export)
├── ReviewSummary.test.tsx     # test next to it
├── index.ts                   # optional: export { ReviewSummary } from "./ReviewSummary";
├── constants.ts               # values used only by this component and its children
├── helpers.ts                 # pure functions used only here (+ helpers.test.ts)
├── types.ts                   # only if types are shared between files of this folder
├── use-summary-sections.ts    # hook used only by this component
└── _components/               # private sub-components with their own files
    └── SectionHeader/
```

A single-file component needs no folder. Create the folder when the second file appears (test, constants, helper,
sub-component). Styling files follow the project's styling approach.

## Shared layer anatomy

| Folder | Holds | Test for belonging |
|---|---|---|
| `components/` | UI with no domain knowledge | Would it make sense in a different product? |
| `hooks/` | Hooks with no domain knowledge | Same test |
| `lib/` | Configured third-party clients and app infrastructure with setup or side effects | Is it "the one instance" of something? |
| `utils/` | Pure functions used by 2+ features, one file per topic | Pure, no React, no I/O, 2+ consumers |
| `types/` | Types used by 2+ features; re-exports of shared contract packages | 2+ consumers |
| `config/` | Typed env access, app-wide constants, feature flags | Read by many, changed rarely |
| `server/` | DB client, data access functions, auth helpers; every module starts with `import "server-only"` | Must never reach the browser |

## Import matrix

| From ↓ may import → | `app/` | `features/` | shared | `server/` |
|---|---|---|---|---|
| `app/` | own route tree only | yes (public API) | yes | Server Components and `'use server'` files only |
| `features/<x>/` | no | own feature only | yes | Server Components and `'use server'` files only |
| shared (`components`, `hooks`, `lib`, `utils`, `types`, `config`) | no | no | yes | no |
| `server/` | no | `model/` and `types` of features only | `utils`, `types`, `config` | yes |

Route trees don't import each other's `_components` either; if two routes need the same UI, it is a feature or shared
component by definition.

## Promotion and demotion, with examples

| Situation | Move |
|---|---|
| `formatVerdict()` in `FindingCard/helpers.ts` is now also needed by `RunHistory` in the same route | `app/<route>/helpers.ts` (or keep in one component and import it within the route) |
| `RunStatus` component is needed on the PR page and on the dashboard | `features/review-runs/components/RunStatus/` |
| `formatCost()` is used by `reviews` and `billing` features | `utils/cost.ts` |
| `useDebouncedValue` written for one search box | Keep it in that component folder until a second, unrelated consumer appears, then `hooks/` |
| A shared `utils/` function ends up used by one feature only | Move it back into that feature's `model/` or the consumer's `helpers.ts` |

Promotion moves the file, keeps its public name, and updates imports in the same change. It never copies code.

## Composing features instead of importing across them

```tsx
// ❌ features/projects/components/ProjectCard.tsx
import { TeamBadge } from "@/features/teams/components/TeamBadge"; // cross-feature import

// ✅ features/projects/components/ProjectCard.tsx — accepts a slot
export function ProjectCard({ project, badge }: { project: Project; badge?: React.ReactNode }) { /* … */ }

// ✅ app/projects/page.tsx (or its _components view) composes both features
<ProjectCard project={project} badge={<TeamBadge teamId={project.teamId} />} />
```

Keep composed pieces presentational: the route (or its view) fetches the data once — e.g. one list request turned
into a lookup map — and passes plain values into the slot, instead of each card fetching its own badge data.

If the shared piece is not UI but data or rules used by both features, move that piece to the shared layer
(`utils/`, `types/`) instead.

## Route groups and private folders

- `(group)` folders organize routes by section or team and give a subset of routes its own layout without changing
  URLs. Use them instead of inventing non-routing folders inside `app/`.
- `_folder` opts a folder out of routing. Use `_components` for route-only UI. Outside `app/` the underscore has no
  framework meaning; use it only for private sub-folders, consistently.
- Next.js special files (`page`, `layout`, `route`, `loading`, `error`, `not-found`, `template`, `default`) are
  reserved names; don't use them for ordinary modules.

## Nesting depth

Aim for at most 3–4 folder levels below `src/` outside of `app/` and at most two levels of nested component folders.
Deeper trees usually mean a sub-component deserves to be its own component in `components/` of the feature, or a
feature is really two features.

## Scaling up: entities layer, FSD, monorepo

- **Many shared domain concepts** (the same `User`, `Repo`, `Run` types, badges and rules used by most features):
  introduce an `entities/<concept>/` layer between shared and features. Features may import entities; entities may not
  import features. This is the Feature-Sliced Design `entities` layer.
- **Full Feature-Sliced Design** (`pages → widgets → features → entities → shared`, segments `ui/api/model/lib/config`,
  public API per slice, Steiger linter) suits large teams that want strict rules. In Next.js keep `app/` at the
  project root for routing and rename FSD's own layers to `_app`/`_pages`.
- **Monorepo:** code shared by several deployable apps moves to `packages/<name>` with its own `package.json` and a
  single entry file. Contract types shared with a backend belong in a shared package, never hand-copied.

## Anti-patterns

- **Type-only top level** (`components/` with 100+ mixed domain and generic components, `containers/`, `services/`):
  every change touches many folders and nothing is deletable.
- **Shared folder holding domain code** (`components/ReviewSummary`): shared stops being reusable and starts
  importing features.
- **Features importing features**: hidden coupling; the deletion test fails.
- **Catch-all folders** (`common/`, `misc/`, `shared/stuff`, one giant `utils.ts`/`constants.ts`): name things after
  what they contain.
- **Mirrored test trees** (`__tests__/` mirroring `src/`): tests drift away from the code they cover.
- **Speculative shared modules**: a "reusable" module with one consumer adds indirection and usually the wrong
  abstraction.

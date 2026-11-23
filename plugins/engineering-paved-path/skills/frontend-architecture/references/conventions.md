# Conventions

## Contents
- Constants
- helpers vs utils vs lib vs model
- Types
- File and folder naming
- Exports
- `index.ts` files
- Imports

## Constants

**Where:** the most local home that covers every user.

| Used by | Home |
|---|---|
| One function or component | Module level in the same file, above the component |
| Several files of one component/route folder | `constants.ts` in that folder |
| Several parts of one feature | `features/<domain>/constants.ts` |
| Several features or app-wide (limits, breakpoints, storage keys, public URLs) | `config/constants.ts` (or a topic file in `config/`) |

**How:**

- Static values (option lists, maps, config objects, regexes) live at module level, not inside a component body,
  so they are created once and read as configuration.
- `CONSTANT_CASE` only for module-level constants and enum-like maps; values computed per call stay `camelCase`.
- Use `as const` for literal maps and tuples so types follow the values.
- Derived values that depend on props or state are not constants; compute them in render or in a hook.
- A magic value used in two places becomes a named constant at the narrowest common home.
- No single ever-growing global `constants.ts`; split by topic (`config/limits.ts`, `config/storage-keys.ts`) once
  unrelated groups appear.
- User-facing strings belong to the i18n message files when the project has i18n, not to constants.

```ts
// features/reviews/constants.ts
export const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
export const MAX_FINDINGS_PER_PAGE = 50;
```

## helpers vs utils vs lib vs model

The difference is **scope and purity**, so the name tells a reader how far a change can ripple.

| Name | Scope | Content | Example |
|---|---|---|---|
| `helpers.ts` | One component, route or folder | Pure functions used only there (formatting for that view, grouping, mapping props) | `FindingCard/helpers.ts` → `formatLineRange()` |
| `model/` | One feature | Business rules and domain calculations, pure | `features/reviews/model/verdict.ts` → `getVerdict()` |
| `utils/<topic>.ts` | 2+ features | Pure, domain-agnostic or cross-domain functions, grouped by topic | `utils/date.ts`, `utils/cost.ts` |
| `lib/` | App-wide | Configured instances and infrastructure with setup or side effects | `lib/api-client.ts`, `lib/query-client.ts` |

- A helper becomes a util when a consumer in another feature appears (move the file, keep the function name).
- Never a catch-all `utils.ts`, `helpers.ts` at the root, `common/` or `misc/`: names like that say nothing about the
  content and become dumping grounds. Name the module after what its functions share (`date`, `currency`, `diff`).
- Wrap a platform API you use with fixed options (e.g. `Intl.NumberFormat` for money) in one util so the app uses one
  set of options.
- If it calls hooks, it is a hook (`use…`), not a helper. If it performs I/O, it belongs in `api/` or `lib/`.

## Types

- Used in one file → declare it there (component props stay next to the component).
- Shared between files of a folder or feature → `types.ts` in that folder/feature.
- Shared between features → `types/<topic>.ts`.
- Shared with a backend or between packages → a shared contract package, re-exported from one module
  (e.g. `lib/types.ts` or `types/api.ts`); never hand-copied.
- Use `import type` for type-only imports.

## File and folder naming

Follow the project's existing convention. When there is none:

| Thing | Convention | Example |
|---|---|---|
| Component file and its folder | PascalCase, file named like the folder | `RunStatus/RunStatus.tsx` |
| Component test | Component name + `.test` | `RunStatus.test.tsx` |
| Hook file | kebab-case starting with `use-` | `use-run-polling.ts` |
| Other modules (helpers, constants, types, api, model, utils) | kebab-case | `get-review.ts`, `constants.ts` |
| Route, feature and shared folders | kebab-case; dynamic segments camelCase | `review-runs/`, `[reviewId]/` |
| Next.js special files | lowercase as required by Next.js | `page.tsx`, `layout.tsx`, `route.ts` |

Pick names after the domain (`review-runs`), not the screen (`run-page-stuff`) or the role (`modals`). Enforce the
choice with a lint rule rather than review comments (see `enforcement.md`).

## Exports

- Named exports for everything except files where Next.js requires a default export (`page`, `layout`, `route`
  handlers use named HTTP methods, `loading`, `error`, `not-found`, `template`, `default`).
- Export only what other modules use; a component folder usually exports the component and its props type.
- No mutable exports (`export let`).

## `index.ts` files

An `index.ts` is allowed only as a **thin forwarder**: explicit named re-exports of a folder's public surface, nothing
else.

```ts
// ✅ features/reviews/components/RunStatus/index.ts
export { RunStatus } from "./RunStatus";
export type { RunStatusProps } from "./RunStatus";

// ❌ lib/hooks/index.ts — aggregates several modules and hides where things live
export * from "./reviews";
export * from "./agents";
```

- Never `export *`; never an index that aggregates several sibling folders into one import.
- No code, constants or side effects in an index file.
- Inside a folder, import siblings directly (`./RunStatus`), never through the folder's own index — that is how
  circular imports appear.
- A feature may have one `index.ts` as its public API for routes; feature-internal code imports files directly.
- Packages (design system, shared contracts) keep a single entry file; that is their public API.

## Imports

- Use the `@/` alias for imports that leave the current folder tree; use relative `./` imports within a component or
  feature folder. More than one `../` usually means the import should go through the alias.
- Never import another component's or feature's internal files (`@/features/reviews/components/RunStatus/helpers`);
  import its public surface or promote the shared piece.
- Import order (framework, external, alias, relative) is a formatter/linter concern, not a review topic.

---
name: react-best-practices
description: "React 19 best practices and anti-pattern catalog for React / Next.js apps. Use when writing, reviewing, or refactoring React components, hooks, and state management. Covers component design, derived state, hooks and effects, memoization, keys, conditional rendering, accessibility, data fetching through TanStack Query hooks, styling with a design system, user-facing strings via an i18n library such as next-intl, and error states. For where files and folders go, see frontend-architecture; for Next.js APIs, next-best-practices."
---

# React Best Practices & Anti-Patterns

React 19 conventions for React / Next.js apps. Covers what to do and what to avoid. For code examples, see
[examples.md](examples.md).

## Assumed stack

Versions and conventions are examples — adapt to your project (check its CLAUDE.md / AGENTS.md, if any).

- React 19 (e.g. inside Next.js 15 App Router), TypeScript strict. Without the React Compiler, the memoization rules
  below apply.
- Server data: TanStack Query 5 hooks in `features/<domain>/api/` over a typed API client (e.g. `apiFetch` from
  `lib/api.ts`). No `fetch`/`apiFetch` in components.
- UI primitives from the project's design system; component styles follow one project convention (e.g. a colocated
  `styles.ts` with `CSSProperties` objects, CSS Modules or Tailwind); user-facing text through an i18n library.
- Errors: global React Query cache handlers (e.g. in `lib/providers.tsx`) toast network/5xx query errors and every
  mutation error.

## Severity Levels

Each rule is tagged for use by consuming agents and reviews:

- **CRITICAL** — causes bugs, broken reconciliation or wrong UI
- **HIGH** — causes performance or scaling problems, or breaks a project rule
- **MEDIUM** — hurts maintainability or developer experience
- **LOW** — style and size heuristics; report, don't block

---

## Component Design (CRITICAL)

- Components must be pure — same inputs = same outputs, no side effects during render
- Business logic in hooks/helpers (`helpers.ts`, `features/<domain>/model/`), NOT in component bodies
- A container (the route view or a feature view) calls data hooks and handles loading/error/empty; presentational
  components receive props and render
- Helper functions extracted OUTSIDE the component body
- One component per file (small colocated internal helpers are fine)

### Composition Patterns

- Compose small focused components over monolithic ones
- "Lift Content Up" — move children to the parent when the wrapper doesn't use them for logic
- "Push State Down" — keep state in the component that actually needs it
- Prefer `children` prop and composition over deep prop drilling

### Size heuristics (LOW)

- Around 200 lines or more than 5–7 props suggests the component does too much — consider splitting. A signal for
  review, not a rule.

## Derive, Don't Store (CRITICAL)

The #1 React anti-pattern. Look for it in every review.

- NEVER store derived values in `useState` — compute during render
- NEVER use `useState` + `useEffect` to sync a computed value — just compute it
- NEVER copy server data from a query into `useState` to filter or sort it — derive from `query.data`
- Use `useMemo` ONLY if the computation is expensive (measured, not assumed)

## State Management (HIGH)

### State Location
- Colocate state with the components that use it
- Don't lift state higher than necessary — it causes unnecessary re-renders
- Don't duplicate state across components; server state lives in the React Query cache only

### Context API
- Context is for dependency injection (theme, current selection, toasts), NOT global state management
- Context changes re-render ALL consumers — split contexts by concern
- Prefer hook return values over Context when only one subtree needs the data

### State Hygiene
- Not everything needs to be in `useState` — only values that change over time and affect the UI
- Combine related state with `useReducer` instead of multiple `useState` calls
- URL-dependent state (filters, tabs, selected finding) belongs in search params (`useSearchParams` +
  `router.replace`), which needs a `<Suspense>` boundary above the reader
- localStorage keys keep their legacy `dd-*` names; renaming one resets users' state

## Hooks (HIGH)

### useEffect Rules
Before each `useEffect`, ask: **Is there an external system being synchronized?** If no, it's misused.

- NEVER use `useEffect` for derived state — compute during render
- NEVER use `useEffect` for event handling — put logic in the event handler
- NEVER fetch in `useEffect` — use a query hook
- NEVER chain `useEffect`s that trigger each other — usually means derived state
- ALWAYS declare all dependencies correctly
- ALWAYS clean up subscriptions (SSE `EventSource`), timers, and event listeners

### Memoization Rules
Most `useMemo`/`useCallback` calls are unnecessary. Be skeptical:

- `useMemo` — only for actually expensive computations (sorting/grouping large finding lists, diff parsing)
- `useCallback` — only when the function is passed to a `React.memo` child or is a dependency of another hook
- Simple string concatenation, arithmetic, or boolean checks do NOT need memoization

## Render Factories (CRITICAL)

camelCase functions returning JSX are NOT React components. They break reconciliation, hooks, and dev tools.

- NEVER use `renderThing()` pattern — use `<Thing />` component syntax
- ALWAYS use PascalCase for anything that returns JSX
- Render factories lose component identity on every render, causing full unmount/remount

## Inline Creation in JSX (MEDIUM)

New arrays, objects and functions created inline in JSX get a new identity every render. That only matters when the
receiver compares by identity:

- Static arrays/objects (option lists, column definitions) → module-level constants or `constants.ts` — always fine
- A prop passed to a `React.memo` child, or a value used as a hook dependency → stabilize it (`useMemo` /
  `useCallback`)
- Otherwise leave it inline; wrapping everything in `useMemo`/`useCallback` violates the Memoization Rules above

## Over-Engineering (CRITICAL)

### Premature Abstraction
- Abstractions with only one consumer are premature — inline it
- "Reusable" hooks with hardcoded field names are not reusable — accept config as parameters
- Context storing state that could be computed locally is over-engineered

### Wrapper Components
- Components that only call a hook and return `null` are unnecessary — call the hook directly
- Wrappers that only pass props through add indirection without value

## Data Fetching (HIGH)

- ALL server data through TanStack Query hooks in `features/<domain>/api/` — never
  `fetch`/`apiFetch` in a component body or effect
- The container handles loading, error and empty states (early returns); expected 4xx (404 "nothing yet") render an
  inline empty state, network/5xx are toasted globally (if the app sets that up)
- Mutations: `useMutation` hooks that invalidate the affected query keys on success; don't add a second toast for
  errors the MutationCache already shows
- Cancellation is handled by TanStack Query (pass its `signal` to `apiFetch` for long requests); no hand-rolled
  `AbortController` effects
- Live updates over SSE — subscribe in a dedicated hook that closes the `EventSource` on cleanup

## Styling (MEDIUM)

- Use design-system components first (buttons, badges, panels, charts); import them from its public entry point,
  never deep-import its files
- Follow the project's one styling convention. With colocated `styles.ts` files, styles are `CSSProperties` objects
  (`satisfies CSSProperties`) applied with `style={s.card}` — a valid convention, not a smell
- Dynamic values: spread the static style and override one property (`style={{ ...s.card, borderLeftColor: color }}`)
- Don't mix a border shorthand (`borderColor`, `borderWidth`) with a per-side longhand (`borderLeftColor`) in one
  style — React warns whenever the value changes; use per-side longhands
- Global utility classes from the design-system CSS via `className` are fine; don't mix in a second styling system
  (e.g. Tailwind utilities in a `styles.ts` codebase, or the reverse)

## Strings and i18n (HIGH)

- No hardcoded user-facing text in components: e.g. next-intl `useTranslations('<namespace>')` with keys in
  `messages/<locale>/<namespace>.json`
- Interpolate with ICU placeholders (`t('runs.count', { count })`), not string concatenation
- Technical identifiers (file paths, model ids, severities from the contract) are data, not translations

## Errors (HIGH)

- Route-level failures: a segment `error.tsx` (client component with a retry button) where a failure should not
  take down the whole page — a LOW suggestion for new segments
- Error boundaries do NOT catch errors in event handlers, async code or effects — those surface through the query /
  mutation error states and the global toasts
- Show the API error message (e.g. from an `ApiError`) when it is meant for users; never render stack traces

## Key Prop Patterns (CRITICAL)

- NEVER use array index as `key` when lists can be reordered, filtered, or modified (findings, runs, files)
- NEVER use `Math.random()` or other unstable values as keys — causes full unmount/remount
- When mapping Fragments, put `key` on `<React.Fragment key={id}>`, not on a child

## Conditional Rendering (HIGH)

- NEVER use `{count && <Component />}` when `count` can be `0` — renders literal `0`
- Use `{count > 0 && <Component />}` or ternary instead
- Replace nested ternaries with early returns or extracted components
- For multiple UI states (loading/error/empty/success), use early returns pattern

## Accessibility (HIGH)

- Add `aria-label` to icon-only buttons — without it, they're invisible to screen readers
- Keyboard shortcuts (j/k navigation, command palette) need a visible or documented alternative and must not fire
  while typing in inputs
- Link error messages to fields with `aria-describedby` and `aria-invalid`
- Use `aria-live="polite"` for dynamic content updates (run status, live log summaries, toasts)
- Trap focus inside modals and dropdowns; provide escape path (Escape key + visible Close button)
- Route-change announcements are handled by Next.js; don't add your own

## Performance Beyond Memoization (MEDIUM)

- Next.js splits code per route automatically; don't hand-roll route-level `React.lazy`
- Heavy client-only libraries (mermaid, recharts, large diff views) load lazily with `next/dynamic`
  (`ssr: false`) or `await import()`
- Long lists (findings, diff lines) render incrementally or virtualized once they reach hundreds of rows

## React 19 Patterns (MEDIUM)

- Accept `ref` as a regular prop instead of using `forwardRef`
- `use()` and Actions (`useActionState`, form actions) are not used with the external-API model; mutations stay in
  TanStack Query hooks

## Code Organization (MEDIUM)

Where files and folders go (feature folders, shared code, constants, helpers vs utils, data layer, server/client
boundaries) is covered by the `frontend-architecture` skill. This section only covers what happens inside a file.

### File Quality
- Order: imports, constants, helpers, component, exports
- Reuse existing types (contract types from the shared contracts package) and constants over creating new ones

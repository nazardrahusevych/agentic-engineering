---
name: next-best-practices
description: Next.js 15 App Router best practices - file conventions, RSC boundaries, data patterns under the external-API model, async params, metadata, error handling, route handlers, images/fonts, scripts, bundling, hydration and Suspense
user-invocable: false
---

# Next.js Best Practices

Apply these rules when writing or reviewing Next.js code.

## Assumed stack

Versions and conventions are examples — adapt to your project (check its CLAUDE.md / AGENTS.md, if any).

- **Next.js 15 App Router, React 19**, TypeScript strict. Next 16 notes in the reference files (e.g. `middleware` →
  `proxy`) apply only after upgrading.
- **Data model: pick one.** If a separate backend (e.g. a Fastify API) owns the data, the app reads and writes through
  an API client (e.g. `lib/api.ts`) and TanStack Query hooks in `features/<domain>/api/` — then no Server Actions,
  no DAL, no Route Handlers for the app's own data. See [data-patterns.md](./data-patterns.md) and
  `frontend-architecture`.
- **Pages** are thin Server Components: await `params`, render one client view. Interactive UI lives in
  `'use client'` components under `_components/` or `features/<domain>/components/`.
- **Root layout** (`app/layout.tsx`) is a Server Component: e.g. next-intl `getLocale()`/`getMessages()` →
  `NextIntlClientProvider` → `Providers` (React Query, theme, toasts) inside `<Suspense>`.
- **Strings** via an i18n library such as next-intl: `useTranslations('<namespace>')` / `getTranslations`, messages
  in `messages/<locale>/<namespace>.json`.
- **Styling** from the project's design system plus colocated styles; a new web font goes through `next/font`.
- **Theme script:** an inline no-flash `<script>` in the root layout is an intended exception to "use `next/script`"
  (see [scripts.md](./scripts.md)).
- **Heavy client-only libraries** (mermaid, recharts) load lazily — `next/dynamic` with `ssr: false` or an
  `await import()` inside an effect — never in a Server Component.
- **Errors:** new route segments get an `error.tsx` (client component with a retry) where a failure should not take
  down the whole page; `not-found.tsx` where a missing resource is expected.

## File Conventions

See [file-conventions.md](./file-conventions.md) for:
- Project structure and special files
- Route segments (dynamic, catch-all, groups)
- Parallel and intercepting routes
- Middleware rename in v16 (middleware → proxy)

## RSC Boundaries

Detect invalid React Server Component patterns.

See [rsc-boundaries.md](./rsc-boundaries.md) for:
- Async client component detection (invalid)
- Non-serializable props detection
- Server Action exceptions

## Async Patterns

Next.js 15+ async API changes.

See [async-patterns.md](./async-patterns.md) for:
- Async `params` and `searchParams`
- Async `cookies()` and `headers()`
- Migration codemod

## Runtime Selection

See [runtime-selection.md](./runtime-selection.md) for:
- Default to Node.js runtime
- When Edge runtime is appropriate

## Directives

See [directives.md](./directives.md) for:
- `'use client'`, `'use server'` (React)
- `'use cache'` (Next.js)

## Functions

See [functions.md](./functions.md) for:
- Navigation hooks: `useRouter`, `usePathname`, `useSearchParams`, `useParams`
- Server functions: `cookies`, `headers`, `draftMode`, `after`
- Generate functions: `generateStaticParams`, `generateMetadata`

## Error Handling

See [error-handling.md](./error-handling.md) for:
- `error.tsx`, `global-error.tsx`, `not-found.tsx`
- `redirect`, `permanentRedirect`, `notFound`
- `forbidden`, `unauthorized` (auth errors)
- `unstable_rethrow` for catch blocks

## Data Patterns

See [data-patterns.md](./data-patterns.md) for:
- Server Components vs Server Actions vs Route Handlers
- Avoiding data waterfalls (`Promise.all`, Suspense, preload)
- Client component data fetching

## Route Handlers

See [route-handlers.md](./route-handlers.md) for:
- `route.ts` basics
- GET handler conflicts with `page.tsx`
- Environment behavior (no React DOM)
- When to use vs Server Actions

## Metadata & OG Images

See [metadata.md](./metadata.md) for:
- Static and dynamic metadata
- `generateMetadata` function
- OG image generation with `next/og`
- File-based metadata conventions

## Image Optimization

See [image.md](./image.md) for:
- Always use `next/image` over `<img>`
- Remote images configuration
- Responsive `sizes` attribute
- Blur placeholders
- Priority loading for LCP

## Font Optimization

See [font.md](./font.md) for:
- `next/font` setup
- Google Fonts, local fonts
- Tailwind CSS integration
- Preloading subsets

## Bundling

See [bundling.md](./bundling.md) for:
- Server-incompatible packages
- CSS imports (not link tags)
- Polyfills (already included)
- ESM/CommonJS issues
- Bundle analysis

## Scripts

See [scripts.md](./scripts.md) for:
- `next/script` vs native script tags
- Inline scripts need `id`
- Loading strategies
- Google Analytics with `@next/third-parties`

## Hydration Errors

See [hydration-error.md](./hydration-error.md) for:
- Common causes (browser APIs, dates, invalid HTML)
- Debugging with error overlay
- Fixes for each cause

## Suspense Boundaries

See [suspense-boundaries.md](./suspense-boundaries.md) for:
- CSR bailout with `useSearchParams` and `usePathname`
- Which hooks require Suspense boundaries

## Parallel & Intercepting Routes

See [parallel-routes.md](./parallel-routes.md) for:
- Modal patterns with `@slot` and `(.)` interceptors
- `default.tsx` for fallbacks
- Closing modals correctly with `router.back()`

## Self-Hosting

See [self-hosting.md](./self-hosting.md) for:
- `output: 'standalone'` for Docker
- Cache handlers for multi-instance ISR
- What works vs needs extra setup

## Debug Tricks

See [debug-tricks.md](./debug-tricks.md) for:
- MCP endpoint for AI-assisted debugging
- Rebuild specific routes with `--debug-build-paths`


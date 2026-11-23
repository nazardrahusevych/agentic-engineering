# Next.js server/client boundaries

## Contents
- Pick one data-handling model
- Thin Server Component pages
- Where `'use client'` goes
- Server-only, client-only and universal modules
- Providers
- Fetching data: server, client, or both
- Mutations: Server Actions vs client mutations
- Route Handlers
- Environment variables
- What crosses the boundary
- Boundary checklist

## Pick one data-handling model

Next.js recommends choosing one model per app and not mixing them, so both developers and reviewers know where data
access can happen.

| Model | When | Where the code lives |
|---|---|---|
| **External HTTP API** | A separate backend (REST/GraphQL) already exists | `lib/api-client.ts` + `features/<domain>/api/`. Treat the Next.js side as an untrusted client (zero trust): auth is enforced by the backend |
| **Data Access Layer (DAL)** | Next.js reads a DB or secret-backed services itself (new projects) | `server/` modules marked `server-only`; each function authorizes the current user and returns a minimal DTO; only `server/` touches the DB driver and `process.env` secrets |
| **Component-level access** | Prototypes only | Queries inside Server Components — easy to leak data to clients; don't use in production code |

An app can add a DAL for a new area (e.g. its own table) while the rest stays on the external API; record that
decision in the package's `AGENTS.md` so it doesn't look like accidental mixing.

## Thin Server Component pages

`page.tsx` and `layout.tsx` stay Server Components. A page reads `params`/`searchParams`, optionally prefetches data,
and renders one view component; the view is where `'use client'` starts.

```tsx
// app/reviews/[reviewId]/page.tsx — Server Component
import { ReviewView } from "./_components/ReviewView";

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  return <ReviewView reviewId={reviewId} />;
}

// app/reviews/[reviewId]/_components/ReviewView/ReviewView.tsx
"use client";
export function ReviewView({ reviewId }: { reviewId: string }) {
  const { data } = useReview(reviewId);
  /* … */
}
```

Why: the page keeps server capabilities (metadata, prefetching, streaming, redirects, auth checks) available without a
rewrite, and the client bundle starts at the view instead of the route. If a project already has `'use client'`
pages, don't convert them opportunistically; extract the view when the page is being changed anyway.

## Where `'use client'` goes

- Put it at the **entry of an interactive subtree** (the view, a form, a widget), as low as possible. Every module a
  client entry imports becomes client code, so a directive high up drags the whole subtree into the bundle.
- Children don't need the directive again; only the entry does.
- Keep shared components boundary-free when possible; if a shared component needs client APIs, mark that component,
  not its consumers.
- Server-rendered content can sit inside a client component through `children` or other element props (slots); the
  client component receives rendered output, not server code.
- Wrap client-only third-party components in a small file of your own with `'use client'`.
- Compound components with static members (`Menu.Item`) break when used from a Server Component; expose the parts as
  named exports instead.

## Server-only, client-only and universal modules

| Kind | Marker | Examples | May be imported by |
|---|---|---|---|
| Server-only | `import "server-only"` at the top | DB client, DAL, auth/session helpers, secret-backed SDKs | Server Components, `'use server'` files, Route Handlers, other server-only modules |
| Client-only | `import "client-only"` (optional) or `'use client'` | Code using `window`, `localStorage`, browser SDKs | Client components and hooks |
| Universal | none | Types, schemas, `model/` rules, query key factories and `queryOptions` "cache contracts", `utils/` | Anything |

Keep universal modules free of both server-only and client-only imports; otherwise one stray import poisons the other
environment. When a feature has both server and client code, keep the server part in `server/` (or a clearly named
`*.server.ts` module marked `server-only`) rather than mixing them in one file.

Exception: modules that Node tooling loads outside Next.js — an ORM table schema read by a migration tool
(drizzle-kit, Prisma), seed scripts — can't import `server-only`, because the package throws outside the Next.js
bundler. Keep them under `server/` without the marker and import them only from modules that have it (the DB
client, data-access functions), so the guard still sits on every path from the app.

## Providers

```tsx
// app/providers.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // New client per server render (no data shared between requests), one client in the browser.
  if (typeof window === "undefined") return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  browserQueryClient ??= new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
```

- One `providers.tsx` per provider scope, rendered from the **nearest layout that needs it** (root layout for
  app-wide providers, a section layout for section-only ones). Providers wrap `children`, not the whole document.
- Query client and other configured instances are created in `lib/` (or here) once, never inside feature code.
- Domain context (e.g. "current repository") lives in its feature and is provided by the route that owns it.

## Fetching data: server, client, or both

| Need | Pattern |
|---|---|
| Data needed for the first render and never revalidated on the client | Fetch in the Server Component (via DAL or API client) and pass minimal props |
| Data the client must poll, refetch, mutate optimistically or share across components | Query hooks from `features/<domain>/api/` in client components |
| Both: server provides the first value, client keeps it fresh | Prefetch with the same `queryOptions` in the Server Component, pass `dehydrate(queryClient)` to `<HydrationBoundary>`, read with the same hook on the client |
| A promise started on the server, read once on the client | Pass the unawaited promise as a prop (or via a context provider on that subtree) and unwrap with `use()` inside `<Suspense>` |

The query key and options must be identical on server and client, so define them once in the domain's universal
"cache contract" module (`features/<domain>/api/<domain>-queries.ts`) and import it from both places.

## Mutations: Server Actions vs client mutations

- **External HTTP API model:** mutations are client `useMutation` hooks in `features/<domain>/api/` that call the API
  client and invalidate keys from the domain's key factory. Server Actions are not needed.
- **DAL model:** mutations are Server Actions.
  - Define them in a file with `'use server'` at the top: `app/<route>/actions.ts` for one route,
    `features/<domain>/api/actions.ts` when several routes use them. Client components import them from there.
  - Keep them thin: validate input (schema), check that there is a session, call the DAL, revalidate, return a
    minimal result. A page-level auth check does not protect the action: actions are reachable by direct POST
    requests.
  - Authorization lives in the DAL: every data-access function resolves the current user itself (a cached
    `getCurrentUser()`), checks ownership or permissions, and never trusts a user id passed in by the caller. The
    action's session check is the second layer; together they cover every entry point (actions, pages, Route
    Handlers) that reaches the same function.
  - The input schema is a universal module (`features/<domain>/model/` or next to the form) imported by both the
    form and the action. A `'use server'` file may only export async functions, so schemas and types can't live there.
  - Don't use Server Actions to fetch data; they run one at a time.

## Route Handlers

`app/api/**/route.ts` is a public HTTP endpoint. Use it for backend-for-frontend needs: proxying an external API,
webhooks and callbacks, non-HTML responses (feeds, files). Keep the handler thin and delegate to `server/`. Server
Components must not fetch the app's own Route Handlers; call the data function directly.

## Environment variables

- Only `NEXT_PUBLIC_*` variables reach the browser; read them in one typed module (`config/env.ts`).
- Secrets are read only in `server/` (e.g. `server/env.ts` marked `server-only`). A secret referenced anywhere else is
  a review finding even if it would be stripped at build time.

## What crosses the boundary

- Code crosses through imports; data crosses through props and must be serializable.
- Pass client components the minimal fields they render, not whole records (`user.name`, not `user`). Broad prop
  types on `'use client'` components invite leaking private fields.
- Functions can't be passed from server to client, except Server Actions.

## Boundary checklist

```
- [ ] One data-handling model, recorded in AGENTS.md if more than one is used
- [ ] page.tsx / layout.tsx are Server Components; 'use client' starts at the view or widget
- [ ] Server-only modules import "server-only"; nothing in components/, hooks/, features/*/components imports them
- [ ] Shared contracts (types, schemas, queryOptions, key factories) import neither server-only nor client-only code
- [ ] Providers rendered from the nearest layout that needs them
- [ ] Server Actions: 'use server' file, validated input, session check, thin, mutations only
- [ ] DAL functions resolve and authorize the current user themselves; no caller-supplied user ids
- [ ] Route Handlers only for BFF/proxy/webhooks; not called by the app's own Server Components
- [ ] Secrets read only in server/; client env only via NEXT_PUBLIC_* in config/
```

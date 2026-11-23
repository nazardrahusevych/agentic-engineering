---
name: authentication
description: Authentication, tenancy and authorization in a Fastify API (AuthProvider port, getContext, workspace scoping)
metadata:
  tags: auth, authentication, authorization, tenancy, security
---

# Authentication and Authorization

## Recommended shape: an auth port and one context resolver

- An `AuthProvider` port answers `currentUser(req)` and `currentWorkspace(req)` (or tenant/organization).
- An adapter implements it — a real one (session, OAuth, tokens) or, in a local single-user tool, one that always
  returns a seeded user and workspace.
- `getContext(app.container, req)` (e.g. `modules/_shared/context.ts`) resolves both and returns
  `{ workspaceId, userId }`. It is the only module-level code that takes a `FastifyRequest` for tenancy.

With this shape, a real `AuthProvider` can replace a local one without touching call sites. The workspace rules
below apply if the app is multi-tenant.

## Rules for every route and use case

- Every handler that touches tenant data calls `getContext()` and passes `workspaceId` (and `userId` when needed)
  into the use case as a plain string.
- Every repository method that reads or writes tenant data takes `workspaceId` and filters by it. A missing scope
  is an access-control bug (OWASP A01), even while there is only one workspace.
- An id from another workspace is **404** (`NotFoundError`), never 403 — don't reveal that it exists.
- Authorization that depends on data ("this agent belongs to this workspace", "this run can be cancelled") lives
  in the use case. Authorization that depends only on the caller ("is an admin") may be a scoped `preHandler` hook
  inside the module plugin (see `plugins.md`).
- Never trust a workspace or user id from the body, query or headers; they come only from `getContext()`.

## Adding real authentication

Implement it as a new `AuthProvider` adapter (e.g. in `src/adapters/auth/`) and wire it in the container; keep
`getContext()` as the single entry point. Whatever mechanism is chosen (session cookie, OAuth via GitHub, tokens):

- **Fail closed:** a hook or provider that cannot authenticate throws `AppError('unauthorized', …, 401)`;
  it never falls through to the handler.
- Verify signatures (`verify`, not `decode`); set an explicit algorithm and expiry.
- Cookies: `httpOnly`, `secure` outside localhost, `sameSite`; CORS restricts origins to the web app with
  `credentials: true`.
- Store only password hashes (Argon2id, then bcrypt) if passwords are ever introduced; prefer OAuth.
- Rate-limit authentication endpoints more strictly than the global limit (`config.rateLimit` on the route).
- Never log tokens, cookies or `authorization` headers.
- Treat it as an architecture change: it changes the `AuthProvider` contract wherever that contract is shared.

## Choosing auth plugins

`@fastify/jwt`, `@fastify/session`, `@fastify/oauth2`, `@fastify/bearer-auth`, request decorators such as
`request.user`, and Redis-backed rate limiting are all valid choices — but introducing one is an architecture
decision, not a drive-by change. Keep them behind the `AuthProvider` adapter so call sites only see `getContext()`.

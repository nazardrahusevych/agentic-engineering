---
name: fastify-best-practices
description: "Fastify 5 mechanics for a TypeScript API: module plugins and a static registry, routes with Zod schemas via fastify-type-provider-zod, response serialization, an AppError family and global error handler, hooks, logging with Pino, configuration and secrets, auth context and workspace scoping, CORS/helmet/rate limit, SSE, and testing with buildApp() + inject() in Vitest. Use when adding or changing a route, module plugin, hook, error mapping, config variable or API test, or when debugging Fastify behavior. Where code belongs inside a module is decided by onion-architecture; query syntax by drizzle-orm-patterns."
metadata:
  tags: fastify, nodejs, typescript, backend, api, server, http
---

# Fastify Best Practices

## Assumed stack

Versions and layout are examples — adapt to your project (check its CLAUDE.md / AGENTS.md, if any).

- **Fastify 5**, TypeScript 5.x (strict, ESM), Node ≥ 22, run with `tsx` (dev) and Vitest (tests).
- **Zod 3** through **`fastify-type-provider-zod` v4** — request validation and response serialization.
  One schema system per app: no TypeBox, Ajv options, `addSchema`/`$ref` or `env-schema` alongside it.
- `buildApp()` (e.g. `src/app.ts`) wires everything once: Zod compilers → `container` decorator → helmet, CORS,
  SSE, rate limit → health routes → global error handler → modules from a static registry
  `src/modules/index.ts` (no `@fastify/autoload`).
- Database: Drizzle over postgres-js inside the DI container (`app.container.db`); no `@fastify/postgres`.
- Errors: an `AppError` family (e.g. `src/platform/errors.ts`); envelope `{ error: { code, message, details } }`;
  validation → 422.
- Tenancy (if multi-tenant): `getContext(app.container, req)` → `{ workspaceId, userId }` from an `AuthProvider`.
- Module layering (routes → service → repository, domain, ports): **`onion-architecture`**.

## Quick start: a route in an existing module

```ts
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService({ agents: new AgentsRepository(app.container.db) });

  app.get('/agents/:id', { schema: { params: IdParams, response: { 200: Agent } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });
}
```

New module: create `modules/<name>/routes.ts`, then add one import + one entry to `modules/index.ts`.

## Reading order for common tasks

- **Add a route or module:** `routes.md` → `schemas.md` → `serialization.md` → `error-handling.md`
- **Add a hook or cross-cutting behavior:** `plugins.md` → `hooks.md`
- **Add a config variable or secret:** `configuration.md`
- **Write an API test:** `testing.md`
- **Touch auth, tenancy or security headers:** `authentication.md` → `cors-security.md`

## Rule files

Project setup (the assumed stack above):

- [rules/plugins.md](rules/plugins.md) — how `buildApp()` and module plugins are organized, encapsulation
- [rules/routes.md](rules/routes.md) — thin handlers, methods and status codes, the module registry
- [rules/schemas.md](rules/schemas.md) — Zod schemas for params, query, body and response
- [rules/serialization.md](rules/serialization.md) — Zod response serialization, dates, stored JSON, SSE
- [rules/error-handling.md](rules/error-handling.md) — `AppError` family, the global handler, 5xx hygiene
- [rules/authentication.md](rules/authentication.md) — `AuthProvider`, `getContext()`, workspace scoping
- [rules/configuration.md](rules/configuration.md) — `platform/config.ts`, `SecretsProvider`, feature flags
- [rules/database.md](rules/database.md) — Drizzle client in the container, lifecycle, repositories
- [rules/testing.md](rules/testing.md) — Vitest, `buildApp()` + `inject()`, mocks, Testcontainers
- [rules/typescript.md](rules/typescript.md) — tsx, types from Zod schemas, declaration merging

Generic Fastify mechanics, each with a short note on recommended use at the top:

- [rules/hooks.md](rules/hooks.md) — hooks and the request lifecycle
- [rules/logging.md](rules/logging.md) — Pino
- [rules/decorators.md](rules/decorators.md) — decorators (keep to the `container`)
- [rules/cors-security.md](rules/cors-security.md) — CORS, helmet, rate limit
- [rules/performance.md](rules/performance.md) — performance

Add only when the app needs them:

- [rules/content-type.md](rules/content-type.md) — custom parsers, multipart uploads
- [rules/websockets.md](rules/websockets.md) — WebSockets (prefer SSE for server → client)
- [rules/http-proxy.md](rules/http-proxy.md) — proxying
- [rules/deployment.md](rules/deployment.md) — graceful shutdown, container/cloud deployment

## Core principles

- **Encapsulation:** one module = one encapsulated plugin; infrastructure only in `buildApp()`.
- **Schema-first:** every new route declares params/query/body and response with Zod.
- **Thin handlers:** context → one use-case call → return; errors are thrown and shaped once.
- **Scope everything:** in a multi-tenant app, every tenant query filters by `workspaceId`.
- **Minimal dependencies:** prefer Fastify's built-ins and the plugins already installed; a new `@fastify/*` plugin
  needs a stated reason.

---
name: routes
description: Route definition and organization in a Fastify API (module plugins, thin handlers, static registry)
metadata:
  tags: routes, handlers, http, rest, api
---

# Route Organization and Handlers

Where code goes inside a module (routes → service → repository, domain rules, ports) is decided by the
`onion-architecture` skill. This file covers the Fastify mechanics of a route.

## Where routes live

```
src/modules/<name>/
  routes.ts        # default export: the module plugin — composition at the top, then the routes
  schemas.ts       # optional: request schemas once routes.ts grows
  service.ts       # use cases
  repository.ts    # Drizzle
  constants.ts, helpers.ts, index.ts (public API for other modules)
```

Add a module: create `modules/<name>/routes.ts`, then add **one import and one entry** to
`src/modules/index.ts`. No `@fastify/autoload`, no per-folder route files, no `prefix`: each route declares
its full path (`/repos/:id/pulls`).

## A thin handler

```typescript
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService({ agents: new AgentsRepository(app.container.db) /* … */ });

  app.put('/agents/:id', { schema: { params: IdParams, body: UpdateAgentBody, response: { 200: Agent } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });
}
```

A handler: declares schemas → resolves `getContext()` → calls **one** use-case method → returns the result.
It does not query the database, call SDKs, compute business rules, `try/catch` to reshape errors, or set status
codes for business outcomes. `req.params`, `req.query`, `req.body` are typed by the Zod schema — no `as` casts.

## Methods and status codes

| Action | Method | Success status |
|---|---|---|
| Read | `GET` (never writes; a "refresh on read" becomes a `POST` or a job) | 200 |
| Create | `POST` | `reply.status(201)` |
| Replace / update | `PUT` / `PATCH` | 200 with the updated resource |
| Delete | `DELETE` | 204, no body |
| Start long work (a job, an import, a reindex) | `POST` that enqueues and returns the job id | 202 or 201 |

Failures are thrown (`NotFoundError`, `ValidationError`, `AppError`) and shaped by the global error handler.

## Params, wildcards, query strings

- Params and query values arrive as strings; coerce them in the Zod schema (`schemas.md`).
- `find-my-way` regex params (`/:id(\\d+)`) and wildcards (`/files/*`) are allowed when a route really needs them;
  still validate the captured value with Zod.

## Route-level config

Per-route options go in the route's `config`, e.g. opting out of the global rate limit for health checks:

```typescript
app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
```

Long-running or expensive routes (jobs, model calls) may set a stricter `config.rateLimit`.

## Streaming

Live progress can stream over SSE (`reply.sse(...)` from `fastify-sse-v2`). The handler subscribes to an event bus
and streams; the use case only publishes events.

## Not found and unknown routes

Unknown URLs get Fastify's default 404. Don't add a custom `setNotFoundHandler` per module; if the envelope for
unknown routes ever needs to match `{ error: { code, message } }`, change it once in `buildApp()`.

## Don't

- Handlers in a separate `handlers.ts` that take `request.server.db` — services come from the module composition.
- Dynamic route registration from the database or config files.
- Route versioning with `constraints: { version }` when the API ships together with its only client.
- Reaching into another module's `service.ts` / `repository.ts` from a route; use its `index.ts` or a container
  facade.

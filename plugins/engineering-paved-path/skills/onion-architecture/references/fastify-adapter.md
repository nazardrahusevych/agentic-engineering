# Fastify as the driving adapter

Fastify is the outermost ring on the driving side: it turns HTTP into use-case calls. This file says what a route
file may and may not do; Fastify mechanics are in `fastify-best-practices`.

## Contents
- One module = one encapsulated plugin
- The plugin function is the module's composition root
- Anatomy of a thin route
- Schemas: params, querystring, body, response
- Request context and tenancy
- Errors: throw inward, shape once
- Other driving adapters: jobs, SSE, CLI
- Testing the adapter
- Checklist

## One module = one encapsulated plugin

- Each module exports one plugin (default export of `routes.ts`) and is registered once in the static module
  registry. Do not wrap feature modules in `fastify-plugin`: encapsulation keeps their hooks and decorators private.
- Only infrastructure is shared upward: the DI container decorated on the root instance, global plugins
  (helmet, CORS, rate limit, SSE) and the error handler registered before modules so every module inherits it.
- A hook that only one module needs (e.g. a per-module auth check) is added inside that module's plugin, not
  globally.
- Modules never reach each other through Fastify (no decorating a service on the root for another module to use).
  Cross-module access goes through the container facade or the other module's `index.ts`.

## The plugin function is the module's composition root

The top of the plugin builds the module's object graph from the container, once, and the handlers close over it.
This is the only module file that may touch the container besides `getContext()`.

```ts
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { db } = app.container;

  // composition: concrete classes are chosen here, nowhere else in the module
  const service = new AgentsService({
    agents: new AgentsRepository(db),
    llm: (provider) => app.container.llm(provider),
  });

  app.get('/agents', { schema: { response: { 200: z.array(AgentSchema) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });
}
```

Pass functions (`llm: (p) => app.container.llm(p)`) for lazily resolved adapters so tests that override the
container still win and secrets are read on use, not at boot. If wiring grows beyond a few lines, move it to
`composition.ts` in the module and keep `routes.ts` for handlers.

## Anatomy of a thin route

A handler does exactly this, in order:

1. Declares schemas for everything it reads and returns.
2. Resolves the request context (workspace, user).
3. Calls **one** use-case method with plain values (`req.params.id`, `req.body`).
4. Returns the result (the serializer applies the response schema).

It does not: query the database, call SDKs, compute business rules, loop over several service calls to assemble a
workflow, catch errors to reshape them, or set status codes for business outcomes other than `201`/`204` for
creation/deletion.

Mapping the parsed body to the use-case input is allowed when names differ, but prefer a use-case input type that
matches the schema output so the handler passes `req.body` straight through. Don't rebuild the object field by field
with conditional spreads.

GET handlers never write. A "refresh on read" behavior becomes an explicit POST use case or a background job.

## Schemas: params, querystring, body, response

- Declare `params`, `querystring`, `body` and `response` on every new route; the Zod type provider then types
  `req` and the reply. No manual `.parse(req.body)` in handlers.
- **Response schemas are part of the adapter's job.** They whitelist fields (a column added to a row cannot leak),
  document the contract and speed up serialization. Key them by status (`200`, `201`, `204: z.undefined()`).
- Reuse contract schemas from the shared package for responses when they exist; define request schemas next to the
  route (or in `schemas.ts`) because they describe this endpoint's input, not the domain.
- Keep validation synchronous and local: no database lookups in schemas or `preValidation`; "does this id exist" is
  a use-case question that ends in `NotFoundError`.
- Common pieces (`IdParams`, pagination) live in the shared module schemas, not copied per module.

## Request context and tenancy

- Every handler calls the context helper and passes `workspaceId` (and `userId` when needed) into the use case as
  plain strings. The use case and repository never see the request object.
- The context helper is the only module-level code allowed to take a `FastifyRequest`, because it is part of the
  HTTP adapter.
- Authorization that depends only on the caller (authenticated, has role) can be a scoped hook; authorization that
  depends on data (owns this agent) belongs in the use case.

## Errors: throw inward, shape once

- Use cases throw the shared error family; the global error handler maps them to the response envelope.
  Validation errors from the type provider are mapped there too (currently to 422).
- Handlers don't `try/catch` to translate errors and don't `reply.code(404).send(...)` for "not found" — throw
  `NotFoundError` in the use case, or in the handler only when the use case returns `undefined` by contract.
- Response-serialization failures are logged and returned as a generic 500 by the handler; never send the raw
  object.

## Other driving adapters: jobs, SSE, CLI

- **Job handlers** receive `payload: unknown`. Parse it with a Zod schema at the top of the handler (it came from a
  queue/table, i.e. outside), then call one use-case method. Register handlers from the composition root, not from
  inside a service constructor.
- **SSE endpoints** subscribe to the event bus port and stream; the use case publishes events, it doesn't know about
  SSE or the reply stream.
- **CLI entrypoints** (migrate, seed, scripts) are composition roots of their own: build what they need, call use
  cases or repositories, exit. Use the project's entrypoint helper for the "am I main" check.

## Testing the adapter

- Build the app with the factory and call routes with `inject()`; no port is opened. Override external adapters via
  the container overrides so HTTP tests never hit GitHub or an LLM.
- Route tests assert status, response shape (it must pass the response schema) and that the right error envelope is
  produced. Business rules are tested in the domain and use-case tests, not through HTTP.

## Checklist

```
- [ ] Module registered once; plugin not wrapped in fastify-plugin
- [ ] Wiring at the top of the plugin (or composition.ts) with explicit dependencies
- [ ] params / querystring / body / response schemas on every route
- [ ] Handler = context + one use-case call + return
- [ ] No drizzle-orm, db/*, SDK imports in routes.ts
- [ ] No try/catch reshaping errors; no business status codes
- [ ] GET handlers don't write
- [ ] Job payloads parsed at the handler boundary
```

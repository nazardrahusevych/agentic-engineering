---
name: schemas
description: Request and response validation in a Fastify API with Zod and fastify-type-provider-zod
metadata:
  tags: validation, schemas, zod, type-provider
---

# Validation with Zod

This setup validates every route with **Zod 3** through **`fastify-type-provider-zod` v4** (versions are examples —
adapt to your project). `buildApp()` installs `validatorCompiler` and `serializerCompiler` once; each module opts in
with `appBase.withTypeProvider<ZodTypeProvider>()` at the top of its plugin. Don't mix in TypeBox, raw JSON Schema
objects, Ajv options or `app.addSchema()` / `$ref` — pick one schema system per app.

## Declare every part the route reads and returns

```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Agent } from '@acme/contracts'; // the shared contracts package
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const ListQuery = z.object({
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateAgentBody = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
});

export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // ...composition: build the service from app.container (see onion-architecture)

  app.get('/agents', { schema: { querystring: ListQuery, response: { 200: z.array(Agent) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.query); // req.query is typed and already coerced
  });

  app.post('/agents', { schema: { body: CreateAgentBody, response: { 201: Agent } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.status(201);
    return service.create(workspaceId, req.body);
  });

  app.get('/agents/:id', { schema: { params: IdParams, response: { 200: Agent } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id); // throws NotFoundError when missing
  });
}
```

- Every **new** route declares `params`, `querystring`, `body` (whatever it reads) **and** `response`.
  Routes without a `response` schema are legacy; don't copy them.
- No manual `.parse(req.body)` / `.safeParse(req.query)` in handlers — the type provider already validated and typed
  the request. `safeParse` belongs where data arrives without a route schema (LLM output, JSON columns, job payloads;
  see the `zod` and `onion-architecture` skills).
- Status codes: `reply.status(201)` for creation, `204` with no body for deletion. Business outcomes (not found,
  conflict) are thrown as `AppError` subclasses, never sent with `reply.code(404).send(...)`.

## Where schemas live

| Schema | Home |
|---|---|
| Response body, domain shapes (`Agent`, `Order`, …) | the shared contracts package — reuse it; if it is copied into several packages, a contract change edits every copy in one commit |
| Request params / query / body of one endpoint | next to the route in `routes.ts`, or the module's `schemas.ts` once routes grow |
| Pieces several modules use (`IdParams`, pagination) | a shared module folder, e.g. `src/modules/_shared/schemas.ts` |

## Params and query strings arrive as strings

- Numbers: `z.coerce.number().int()`.
- Booleans: `z.enum(['true', 'false']).transform((v) => v === 'true')`. **Never `z.coerce.boolean()`** —
  it turns the string `'false'` into `true`.
- uuid ids: `z.string().uuid()` (`IdParams`); ids that are names (e.g. `/providers/:id`) get their own schema.
- Defaults with `.default()` so the handler never sees `undefined` for optional knobs.

## Request validation rules

- Keep schemas synchronous and local: no database lookups in `.refine()` or `preValidation`. "Does this id exist"
  is a use-case question that ends in `NotFoundError`.
- Cross-field rules use `.refine()` / `.superRefine()` on the body schema.
- Unknown keys are stripped (Zod's default). Use `.strict()` only when unknown fields must be rejected.
- Request bodies are capped by `bodyLimit` in `buildApp()` (e.g. 1 MB); a route that needs more raises it explicitly.

## Validation errors

The global error handler in `buildApp()` maps `hasZodFastifySchemaValidationErrors(err)` to
**422** `{ error: { code: 'validation_error', message, details } }`. Routes don't customize this, don't catch it,
and don't add their own `setErrorHandler`. Prefer matching a `ZodError` by shape over `err instanceof ZodError`: if
two packages load their own Zod instance, `instanceof` misses errors from the other one.

## Checklist

```
- [ ] Module uses withTypeProvider<ZodTypeProvider>()
- [ ] params / querystring / body / response declared for every new route
- [ ] Response schema reuses the shared contract when one exists
- [ ] Query/params coerced correctly (no z.coerce.boolean)
- [ ] No manual parse of req.*; no DB calls inside schemas
- [ ] No TypeBox, JSON Schema objects, addSchema or $ref
```

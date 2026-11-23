---
name: plugins
description: Plugin development and encapsulation in Fastify, and a recommended way to register infrastructure plugins and feature modules
metadata:
  tags: plugins, encapsulation, modules, architecture
---

# Plugin Development and Encapsulation

## Recommended app layout

A single `buildApp()` (e.g. in `src/app.ts`) is the only place that wires infrastructure, in this order:

1. Zod `validatorCompiler` / `serializerCompiler`.
2. `app.decorate('container', container)` — the DI container (config, db, adapters, job runner, event bus).
3. `@fastify/helmet`, `@fastify/cors` (origin = the web app), `fastify-sse-v2`, `@fastify/rate-limit`
   (off when `NODE_ENV=test`).
4. `/health` and `/health/ready`.
5. The global error handler — **before** modules, so every encapsulated module inherits it.
6. Feature modules from a static registry such as `src/modules/index.ts`.

Rules that follow from it:

- **A feature module is one encapsulated plugin**: the default export of `modules/<name>/routes.ts`, added with one
  import + one entry in `modules/index.ts`. No `@fastify/autoload`: dynamic `import()` of `.ts` files is not portable
  across tsx, bundlers and Vitest, and a static registry keeps the module list explicit.
- **Never wrap a feature module in `fastify-plugin`.** Encapsulation keeps its hooks private; `fp` would leak them
  to every other module.
- **No new decorators for feature code.** The database, adapters and services are reached through
  `app.container` and the module's own composition (see `onion-architecture`), not `fastify.decorate('db', …)`.
- **Modules don't talk through Fastify.** One module never decorates something for another to use; cross-module
  access goes through the container facade or the other module's `index.ts`.
- **Routes declare full paths** (`/agents/:id`); modules are registered without `prefix`.

## Understanding Encapsulation

Each `register()` creates a child context; decorators, hooks and plugins registered inside it are invisible to
siblings and the parent:

```typescript
app.register(async function childPlugin(fastify) {
  fastify.addHook('onRequest', async (req) => {
    req.log.debug({ url: req.url }, 'only routes in this plugin run this hook');
  });
  fastify.get('/child', async () => ({ ok: true }));
});

app.get('/parent', async () => ({ ok: true })); // the hook above does not run here
```

## Breaking Encapsulation with fastify-plugin (infrastructure only)

`fastify-plugin` makes a plugin's decorators and hooks visible to its parent. That is only appropriate for
app-wide infrastructure, which is best wired directly in `buildApp()`. If a new
cross-cutting piece is needed (e.g. a metrics hook), add it there or as an `fp` plugin registered from `buildApp()`
before the modules — never from inside a module.

```typescript
import fp from 'fastify-plugin';

export default fp(
  async function requestTiming(fastify) {
    fastify.addHook('onResponse', async (req, reply) => {
      req.log.info({ ms: reply.elapsedTime, route: req.routeOptions.url }, 'request done');
    });
  },
  { name: 'request-timing', fastify: '5.x' },
);
```

## Registration order

Plugins load asynchronously but in registration order; `await app.register(...)` (as `buildApp()` does) keeps the
order explicit. Anything a module relies on (container, error handler, CORS) must be registered before the module
loop.

## Plugin options

If a plugin takes options, type them and validate them at registration (a Zod schema is fine). Fail fast with a
clear error instead of defaulting silently.

## Scoped hooks inside a module

A hook that only one module needs is added inside that module's plugin and applies to that module's routes only:

```typescript
export default async function adminRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.addHook('preHandler', async (req) => {
    const { userId } = await getContext(app.container, req);
    if (!(await adminPolicy.isAdmin(userId))) throw new AppError('forbidden', 'Admins only', 403);
  });

  app.get('/admin/stats', { schema: { response: { 200: Stats } } }, async () => service.stats());
}
```

Authorization that depends on data ("owns this agent") belongs in the use case, not in a hook.

## Testing plugins

Test through the real app: `buildApp({ config, db, overrides })` + `app.inject()` (see `testing.md`). A standalone
infrastructure plugin can also be registered on a bare `Fastify()` instance in a Vitest test:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import requestTiming from '../src/platform/request-timing.js';

describe('requestTiming', () => {
  const app = Fastify();
  afterAll(() => app.close());

  it('registers without errors', async () => {
    await app.register(requestTiming);
    await app.ready();
    expect(app.hasPlugin('request-timing')).toBe(true);
  });
});
```

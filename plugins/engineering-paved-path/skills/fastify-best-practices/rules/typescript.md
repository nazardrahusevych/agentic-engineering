---
name: typescript
description: TypeScript with Fastify (tsx, Zod type provider, declaration merging)
metadata:
  tags: typescript, types, type-provider, tsx
---

# TypeScript Integration

## How the server runs TypeScript

Example setup — adapt to your project:

- TypeScript 5.x, strict, ESM. A dev script runs `tsx watch src/server.ts`; tests run through Vitest. Don't switch
  scripts to Node's type stripping without checking it supports everything the code uses (e.g. `paths`, enums).
- `tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler` (or `NodeNext`). Follow the project's convention for
  relative import extensions (e.g. `import { getContext } from '../_shared/context.js'`).
- Shared packages may resolve through tsconfig `paths` to source folders; then a change in the shared source needs
  a type-check of every package that imports it.
- Type-check with `tsc --noEmit` (usually a `typecheck` script).

## Types come from Zod schemas, not route generics

The Zod type provider types `req.params`, `req.query`, `req.body` and the reply from the route's `schema`.
Don't add `app.get<{ Body: …; Reply: … }>()` generics or hand-written `interface …Body` types next to a schema.

```typescript
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>(); // once, at the top of the module plugin

  app.post('/repos', { schema: { body: AddRepoBody, response: { 201: Repo } } }, async (req, reply) => {
    req.body.url; // typed from AddRepoBody
    reply.status(201);
    return service.add(/* … */);
  });
}
```

Need the type elsewhere (service input, test)? Export `type AddRepoBody = z.infer<typeof AddRepoBody>` from the
schema's file instead of declaring a parallel interface.

## Typing decorators

Keep the instance decorators minimal — ideally only the DI container, declared next to `buildApp()`:

```typescript
declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}
```

Don't add new instance, request or reply decorators for feature code (no `request.user`, no `reply.sendSuccess`).
Request context comes from `getContext(app.container, req)`; services come from the module's own composition.
If infrastructure ever needs a new decorator, declare its type next to the `decorate` call in the same commit.

## Typing hooks and plugins

- Module plugins are plain `async function (appBase: FastifyInstance)` default exports registered from a static
  registry (e.g. `src/modules/index.ts`); they don't need `FastifyPluginAsync` option generics.
- Hook handlers use Fastify's types (`preHandlerHookHandler`, `onRequestHookHandler`) when written as standalone
  constants.

## Avoiding type gymnastics

- Prefer `z.infer`, contract types from the shared contracts package and plain interfaces over deep conditional/mapped types.
- Don't build generic "CRUD route factories"; each module declares its routes explicitly.
- `as` casts on request data are a smell — fix the schema instead.

See `typescript-expert` for type-level design and tsconfig questions.

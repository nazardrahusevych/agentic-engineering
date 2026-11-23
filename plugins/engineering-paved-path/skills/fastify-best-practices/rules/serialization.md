---
name: serialization
description: Response serialization in a Fastify API with Zod response schemas
metadata:
  tags: serialization, response, json, zod
---

# Response Serialization

With `fastify-type-provider-zod`, responses are serialized by its `serializerCompiler`, installed once in
`buildApp()`. For a route with a `response` schema it runs the Zod schema over the returned value and then
`JSON.stringify` on the parsed result. There is no `fast-json-stringify`, no Ajv coercion and no custom per-route
`serializerCompiler`.

## Why every new route declares a response schema

1. **Whitelist** — Zod strips keys that are not in the schema, so a column added to a row (or an internal field)
   cannot leak to the client.
2. **Contract** — the response matches the shared contract type the client imports.
3. **Fail closed** — a value that does not match the schema throws `ResponseSerializationError`; the global
   handler logs it and returns a generic 500 instead of sending the raw object.

Speed is not the reason: the Zod serializer is a parse plus `JSON.stringify`.

```typescript
app.get('/agents/:id', { schema: { params: IdParams, response: { 200: Agent } } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.get(workspaceId, req.params.id); // extra keys are stripped by the Agent schema
});
```

## Shapes that survive serialization

- **Dates:** the contract uses ISO strings. Convert `Date` → `toISOString()` in the repository mapper, not in the
  handler.
- **Stored JSON:** fields written by older code may be missing. New fields on stored shapes (traces,
  stats, …) are `.nullish()` and the UI renders a fallback.
- **Nullable vs optional:** `.nullable()` for "present but empty", `.optional()` for "may be absent";
  don't use `.nullish()` to avoid deciding, except for the stored-JSON case above.
- **BigInt:** not JSON-serializable; return numbers or strings.

## Error responses

Errors never go through a route's response schema: handlers throw `AppError` subclasses and the global handler
writes `{ error: { code, message, details } }`. Don't declare `4xx`/`5xx` response schemas per route.

## Streaming (SSE)

Live progress can stream through `fastify-sse-v2` (`reply.sse(...)`); streams bypass serialization. Each event
payload still follows a contract type, and the stream is fed from an event bus — a use case never writes to the
reply.

## Don't

- `preSerialization` hooks that decorate payloads (`_links`, timestamps) — put fields in the contract instead.
- `reply.serializer(...)` / per-route `serializerCompiler` overrides.
- Returning Drizzle rows directly; map them to the contract shape in the repository.

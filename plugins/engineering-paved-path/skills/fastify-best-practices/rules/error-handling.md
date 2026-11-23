---
name: error-handling
description: Error handling in a Fastify API — an AppError family, a single global handler and one response envelope
metadata:
  tags: errors, exceptions, error-handler, validation
---

# Error Handling

## The model: throw inward, shape once

- Code anywhere below the route **throws** an error from one shared family (e.g. `src/platform/errors.ts`).
- **One** global handler, registered in `buildApp()` before the modules, turns it into the envelope
  `{ error: { code, message, details } }` (an `ApiErrorBody` contract the client expects).
- Handlers don't `try/catch` to translate errors and don't send error bodies themselves.

No `@fastify/error`, no `@fastify/sensible` reply helpers (`reply.notFound()` …), no per-module `setErrorHandler`.

## The error family

| Class | `code` | Status | Use for |
|---|---|---|---|
| `AppError(code, message, status = 400, details?)` | your code | your status | anything without a dedicated subclass (`conflict` 409, `forbidden` 403, …) |
| `NotFoundError` | `not_found` | 404 | a scoped lookup found nothing (also for another tenant's id) |
| `ValidationError` | `validation_error` | 422 | a business-level validation that a schema can't express |
| `ExternalServiceError` | `external_service_error` | 502 | a third-party API, CLI or LLM provider failed — thrown by the adapter |
| `ConfigError` | `config_error` | 500 | missing key or misconfiguration (e.g. no API key for a provider) |

Module-specific errors subclass `AppError` (in the module's `domain.ts`, see `onion-architecture`) and keep a stable
snake_case `code` the client can switch on.

```typescript
// service.ts
async get(workspaceId: string, id: string): Promise<Agent> {
  const agent = await this.deps.agents.findById(workspaceId, id);
  if (!agent) throw new NotFoundError('Agent not found');
  return agent;
}
```

## What the global handler does

| Error | Response |
|---|---|
| `hasZodFastifySchemaValidationErrors(err)` — request failed its route schema | 422 `validation_error`, `details` = the issues |
| `isResponseSerializationError(err)` — the handler returned something its response schema rejects | logged, generic 500 `internal_error` |
| a `ZodError` matched **by shape** (`name === 'ZodError'` + `issues`) — not `instanceof`, which fails across Zod instances | 422 `validation_error` |
| `AppError` and subclasses | `err.statusCode` with `{ code, message, details }` |
| anything else | logged, `statusCode ?? 500`, `internal_error` |

If you need a new mapping (e.g. a driver error → 409), add a branch to this one handler.

## Rules

- 5xx responses never carry internals: no stack traces, SQL, file paths or provider responses in `message` /
  `details`. Log them with `req.log.error({ err }, …)` instead; the fallback branch must not forward `err.message`.
- Adapters translate SDK/HTTP errors into the family (`ExternalServiceError`, `NotFoundError`, `ConfigError`):
  a safe summary goes into `details` (`new ExternalServiceError('Payment provider request failed', { status: 502 })`), the
  original error is logged, not forwarded.
- Never put secrets or tokens in `details`.
- "Not found" for a row in another tenant is a 404, not a 403 — don't reveal that the id exists.
- Async errors in handlers and hooks reach the handler automatically; a hook throws an `AppError` instead of
  `reply.code(401).send(...)`.

## Partial failure

When a use case calls several independent sources and only one is required, use `Promise.allSettled` and degrade
the optional ones (degraded results carry `degraded` + `reason`, arrays return `[]`). The main operation must still
work when an optional source fails.

## Unknown routes

Fastify's default 404 handles unknown URLs. If the envelope must match `ApiErrorBody`, change it once in
`buildApp()` with `setNotFoundHandler`; never per module.

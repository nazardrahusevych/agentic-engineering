# Zod at the boundaries

Zod is a parsing tool for the edges of the onion. This file says where schemas live and what the inner rings
receive. How to write schemas is in the `zod` skill.

## Contents
- Parse, don't validate
- Where each schema lives
- What the inner rings receive
- External data: LLM output, webhooks, SDK payloads, job payloads
- Stored data: JSON columns and old documents
- Configuration
- Branded identifiers
- Two Zod instances
- Anti-patterns

## Parse, don't validate

Untrusted data is parsed **once**, at the boundary where it enters, into a precise type. After that the code relies
on the type and never re-checks. Scattered `if (!x.foo)` checks deep in a service ("shotgun parsing") mean the
boundary was skipped.

Every edge where data enters is a parsing point: HTTP requests, job payloads, LLM responses, GitHub responses and
webhooks, JSON read from the database, files read from disk, environment variables.

## Where each schema lives

| Schema | Ring | Home |
|---|---|---|
| HTTP request (`params`, `querystring`, `body`) | driving adapter | the route, or `schemas.ts` of the module |
| HTTP response | driving adapter | the route; reuse the shared contract schema when one exists |
| Shared contract (types both client and server use) | shared kernel | the shared contracts package (all copies in sync, if it is copied) |
| Job payload | driving adapter | next to the job handler |
| LLM structured output | driven adapter | the code that calls the model (or the engine package that owns the prompt) |
| External API / webhook payload | driven adapter | the SDK adapter or webhook route |
| JSON column / stored document | driven adapter | the repository mapper |
| Environment | composition | the config module |

The domain ring does not import Zod. Domain invariants are plain TypeScript (guards, smart constructors, union types)
so the core stays independent of the validation library.

## What the inner rings receive

- Use cases take the **output type** of the boundary schema (or a module input type it is assignable to). They never
  receive `unknown` and never call `.parse` on their arguments.
- Prefer `z.infer<typeof Body>` in the route and a hand-written input interface in the service; TypeScript checks
  that the first fits the second, and the service doesn't depend on the schema module.
- Business validation that needs data (unique name, agent exists, PR is open) is a use-case check that throws a domain
  error — not a Zod refinement, and never an async refinement that queries the database.

## External data: LLM output, webhooks, SDK payloads, job payloads

- **LLM output** is the least trustworthy input in the system. Parse it with a schema at the adapter/engine boundary,
  decide what happens on failure (retry, repair, drop the item, degrade) there, and hand inner rings only parsed
  values. Grounding/citation checks that need domain knowledge happen after parsing, in the domain or engine.
- **SDK responses** are mapped to contract types inside the adapter; parse only the fields you use when the SDK's
  types are not trustworthy (loosely typed REST responses, `any`).
- **Webhooks** are parsed in the route like any request body, after signature verification.
- **Job payloads** arrive as `unknown`; parse at the top of the handler.

## Stored data: JSON columns and old documents

Data written yesterday by older code is outside data today. In the repository mapper:

- parse JSON columns with a tolerant schema: new fields `.nullish()` or with defaults, unknown fields stripped;
- never `row.trace as RunTrace`; a cast hides exactly the drift you will hit after a contract change;
- decide in the mapper what an unparsable document becomes (skip, fallback value, `ExternalServiceError`) so inner
  rings never see half-valid data.

## Configuration

Environment variables are parsed once at startup by the config module (types, defaults, required keys fail fast).
Everything else receives typed values through the composition root; no module reads `process.env`.

## Branded identifiers

When ids of different entities are easily swapped (`workspaceId`, `repoId`, `agentId` are all strings), a branded
type makes the compiler catch it. Brands are type-only and can only be produced by parsing:

```ts
export const RepoId = z.string().uuid().brand<'RepoId'>();
export type RepoId = z.infer<typeof RepoId>;
```

Adopt brands per module when a mix-up bug appears or the module has many id parameters; the route schema produces
them, the use case and repository signatures require them. Don't brand everything up front.

## Two Zod instances

When two packages (e.g. the server and a separate engine package) resolve `zod` from different `node_modules`, schema objects and `ZodError`
classes are not shared. Detect validation errors by shape (`name === 'ZodError'` and an `issues` array), not by
`instanceof`, and don't pass schema objects across the package boundary — pass parsed data or contract types.

## Anti-patterns

- `.parse(req.body)` inside a handler or service instead of a route schema.
- Zod imports in `domain.ts`; domain functions taking `unknown`.
- Async refinements that query the database.
- Casting JSON columns or SDK responses instead of parsing them.
- The same schema copied into several modules instead of living in the shared contracts or `_shared`.
- Validating the same data again in every ring.

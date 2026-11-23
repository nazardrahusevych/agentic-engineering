---
name: onion-architecture
description: Onion (ports and adapters, clean, hexagonal) architecture for backend modules on Fastify + Drizzle + Zod + Postgres — how a module splits into domain, application (use cases, ports) and adapter rings; which file may import Fastify, Drizzle, Zod, SDKs, the DI container or another module; where schemas, use cases, business rules, domain errors, repositories, transactions, row mapping, external API calls, LLM output parsing, jobs and env access live; how dependencies are wired, tested and enforced with dependency-cruiser. Use when creating a backend module, endpoint, service, repository or adapter, deciding where server code belongs, refactoring routes that query the database, adding a transaction, or reviewing a server diff for layering — even if the user never says "onion". Not for Fastify, Drizzle or Zod API details (fastify-best-practices, drizzle-orm-patterns, zod) or frontend structure (frontend-architecture).
metadata:
  version: "1.1.0"
---

# Onion architecture for backend modules

Decides **which ring code belongs to and who may import whom** inside a backend package built on Fastify, Drizzle,
Zod and Postgres. It does not teach the libraries — `fastify-best-practices`, `drizzle-orm-patterns`, `zod` and
`postgresql-table-design` do that.

## Project conventions come first

Before placing or moving anything, read the package's `AGENTS.md` / `CLAUDE.md` and look at a neighbouring module.
Everything below is a **default for gaps**, not a mandate to migrate:

- If the project already decided something (file names, error classes, how modules register), follow it.
- Don't restructure code you weren't asked to touch. Mention legacy violations only in a review or when asked.
- New code follows these rules even when the module around it doesn't yet: a new module, service, repository,
  route or adapter is built the target way.
- Extending legacy code (a new method on a service that takes the container, a route in a module that still
  queries Drizzle in routes) is allowed without migrating it first; don't make the legacy part bigger than the change
  needs, and leave the migration to a dedicated refactor (Workflow C).

## The model: rings inside each module

```
domain        domain.ts      pure rules, types, invariants, domain errors          (innermost)
application   service.ts     use cases: orchestrate ports, own transactions
              ports.ts       interfaces this module needs (repository, transaction runner, clock)
adapters      driving        routes.ts / schemas.ts (Fastify + Zod), job handlers, SSE, CLI
              driven         repository.ts + mappers.ts (Drizzle), src/adapters/* (SDKs)  (outermost)
composition   platform/container.ts + the module's plugin function — the only code that knows concrete classes
```

**Dependencies point inward only.** Adapters depend on application and domain; application depends on domain and
ports; domain depends on nothing but itself, constants, shared contract types and the shared error kernel. Control
may flow outward (a use case calls a repository) because the inner ring owns the interface (port) and the outer ring
implements it.

Why: business rules stay testable without HTTP or a database, a framework or SDK upgrade touches one adapter, and a
module can be read, changed or extracted without dragging its neighbours along.

**Scale the onion to the module.** Package by module (a business capability), layer inside it:

- **Onion-lite (CRUD modules):** `routes.ts` → `service.ts` → `repository.ts`; the shared contract DTO is the model;
  no `domain.ts`, no repository interface.
- **Full onion (modules with real rules):** add `domain.ts` for rules and invariants and `ports.ts` for the
  interfaces the use cases need. Add them when the first real rule or a second implementation appears, not before.
- **Ring folders** (`domain/`, `application/`, `infrastructure/`, `http/`) only when a module passes ~8–10 files.

## Where does this code go?

| Code | Ring | Default home |
|---|---|---|
| HTTP params/query/body/response Zod schemas | adapter (driving) | `routes.ts`, or `schemas.ts` when routes grow |
| Route handler | adapter (driving) | `routes.ts`: resolve context, call one use case, return its result |
| Wiring the module (service + repository + ports) | composition | the plugin function in `routes.ts` (or `composition.ts`) |
| Use case (create, run, sync…) | application | `service.ts` method; one class per module until it grows |
| Business rule, invariant, calculation, state transition | domain | `domain.ts` (pure functions or small classes) |
| Domain error | domain | the shared `AppError` family; module-specific subclasses in `domain.ts` |
| Interface a use case needs (repository, transaction runner, clock) | application | `ports.ts` of the module |
| Interface to an external system (LLM, GitHub, git, secrets) | shared kernel | the shared adapters contract (e.g. a shared contracts package) |
| Drizzle queries, row types, row ↔ model mapping | adapter (driven) | `repository.ts` (+ `mappers.ts`) |
| Read-only list/report that only feeds a response | adapter (driven) | a query method on the repository returning a DTO |
| Transaction across several writes | application (boundary) / adapter (mechanics) | use case calls a `TransactionRunner` port; repository runs on the given executor |
| SDK call (Octokit, OpenAI, simple-git, ripgrep…) | adapter (driven) | `src/adapters/<tech>/` behind a shared port |
| Parsing untrusted external data (LLM output, webhook, JSON column) | adapter | the adapter or repository that receives it |
| Env variables, secrets | composition | `platform/config.ts` / `SecretsProvider`; inner rings get values |
| Job handler, SSE stream, CLI script | adapter (driving) | thin: parse input, call a use case |
| Values used by one module | any | `constants.ts` of that module |
| Something another module needs | public API | `index.ts` of the module (types, constants, port), or a facade on the container |
| Unit test of rules | — | pure test, no mocks |

Details and edge cases: [references/rings-and-rules.md](references/rings-and-rules.md).

## Import rules

| From ↓ may import → | domain | application (service, ports) | adapters (routes, repository, mappers) | Fastify | Drizzle / `db/` | Zod | SDKs | `Container` |
|---|---|---|---|---|---|---|---|---|
| domain | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| application | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| repository / mappers | ✓ | ports only | own module | ✗ | ✓ | to parse stored JSON | ✗ | ✗ |
| routes / schemas | ✓ | ✓ | own module | ✓ | ✗ | ✓ | ✗ | plugin function only |
| `src/adapters/*` | ✗ | ✗ | ✗ | ✗ | ✗ | to parse responses | ✓ | ✗ |
| composition root | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Always allowed: the shared contract types and port interfaces, the shared error classes, the module's own
`constants.ts`, another module's `index.ts`. Never: one module importing another module's internal files; an adapter
importing a module; `process.env` outside config.

## Workflow A — adding a module, endpoint or use case

```
- [ ] 1. Read project conventions (AGENTS.md, a neighbour module); note any that override these defaults
- [ ] 2. Decide onion-lite or full onion: are there rules beyond "validate, store, return"?
- [ ] 3. Write the use case signature first: plain typed input → plain output; list the ports it needs
- [ ] 4. Put rules in domain.ts as pure functions; parse input once at the edge (route schema / adapter)
- [ ] 5. Repository: workspace-scoped methods in domain language, rows mapped before returning
- [ ] 6. Several writes that must succeed together → one transaction owned by the use case
- [ ] 7. Route: params/body/response schemas, context, one use-case call, no try/catch (global error handler)
- [ ] 8. Wire it in the plugin function with explicit dependencies; register the module once
- [ ] 9. Tests per ring; typecheck; run the architecture check if the project has one configured
```

When presenting a plan, list each file with a one-line purpose, then show code only for the parts that carry
architectural decisions (use case signature, ports, wiring, transaction).

## Workflow B — reviewing a diff for layering

Check only rings and dependencies; leave library style to the library skills. For each finding give the file, what
is wrong, why it matters, and where the code should move. Report problems the diff introduces separately from
problems that already existed, so the author knows what blocks this change: code the diff only extends (a new
method on a legacy service that takes the container) is a pre-existing problem and becomes a migration note.

| Severity | Look for |
|---|---|
| High | Drizzle, `db/schema` or an SDK used in a route, service or domain file |
| High | `FastifyRequest`/`reply`, status codes or HTTP headers inside a service or domain |
| High | A module importing another module's internal file; an adapter importing a module |
| High | Unscoped query (no workspace/tenant filter) in a repository |
| Medium | Business rule computed in a route or repository instead of the use case/domain |
| Medium | A new service taking the whole DI container instead of explicit dependencies |
| Medium | Row types (`$inferSelect`) or query builders leaving the repository |
| Medium | Several dependent writes without a transaction; writes inside a GET handler |
| Medium | Missing `response` schema on a new route; manual `.parse` of `req.body` |
| Medium | Untrusted external data (LLM output, JSON column, webhook) used without parsing |
| Low | A port or interface with one implementation and no test that needs a fake |
| Low | `process.env` read outside config; magic values repeated instead of `constants.ts` |
| Low | `export *` in a module's `index.ts` exposing services or repositories |

## Workflow C — moving a legacy module onto the onion

Small, behavior-preserving steps, one module at a time; never a big-bang rewrite.

```
- [ ] 1. Map the module: which routes query the DB, which rules live where, who imports it
- [ ] 2. Pin behavior with route tests (inject) before moving anything
- [ ] 3. Move each Drizzle query from routes into repository methods (same SQL), one route per step
- [ ] 4. Move orchestration and rules from handlers into service methods; handlers become one call
- [ ] 5. Replace the container argument with explicit constructor dependencies; wire in the plugin function
- [ ] 6. Wrap multi-step writes in a transaction; move writes out of GET handlers
- [ ] 7. Extract pure rules into domain.ts with unit tests once they are visible
- [ ] 8. Remove the module's entries from the architecture baseline; typecheck and test after each step
```

## References

Read only the file the task needs:

- **Rings in depth** (each ring's contents and allowed imports, module layouts, public API, errors, worked
  incorrect/correct example) → [references/rings-and-rules.md](references/rings-and-rules.md)
- **Fastify as the driving adapter** (thin routes, Zod schemas incl. response, context, error handler, encapsulated
  module plugins, composition, jobs and SSE) → [references/fastify-adapter.md](references/fastify-adapter.md)
- **Drizzle as the driven adapter** (repositories, mapping, tenant scoping, transactions, read queries)
  → [references/persistence-drizzle.md](references/persistence-drizzle.md)
- **Zod at the boundaries** (parse, don't validate; where schemas live; LLM/webhook/JSON-column parsing; branded IDs)
  → [references/zod-boundaries.md](references/zod-boundaries.md)
- **Ports, adapters and dependency injection** (shared vs module ports, SDK adapters as anti-corruption layers,
  composition root, explicit dependencies vs service locator) → [references/ports-and-di.md](references/ports-and-di.md)
- **Testing per ring** (pure domain tests, use cases with fakes, repositories against real Postgres, routes through
  `inject()`) → [references/testing.md](references/testing.md)
- **Enforcement** (tested dependency-cruiser config, baseline for legacy code, CI rollout)
  → [references/enforcement.md](references/enforcement.md)

## Related skills

- `fastify-best-practices` — plugins, hooks, schemas, serialization, logging, auth mechanics.
- `drizzle-orm-patterns` — schema, queries, relations, transactions and migrations syntax.
- `postgresql-table-design` — tables, types, indexes, constraints.
- `zod` — how to write schemas (this skill only says where they live).
- `security` — authorization and data exposure rules enforced at the edges.
- `typescript-expert` — type-level design, branded types, tsconfig paths.
- `frontend-architecture` — the same "where does code go" question for the Next.js client.

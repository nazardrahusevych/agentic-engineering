# Rings in depth

## Contents
- The dependency rule
- Domain ring
- Application ring
- Adapter ring
- Composition root
- Module layouts (onion-lite, full, ring folders)
- Public API between modules
- Shared kernel
- Errors
- Which model type flows where
- Worked example: one use case, wrong and right
- Anti-patterns

## The dependency rule

Source code may only name things from its own ring or rings further in. An inner ring never mentions a class,
function, type or data format defined further out — not a Fastify request, not a Drizzle row, not an SDK response.
When an inner ring needs something from outside (load data, call GitHub), it declares an interface (port) and an
outer ring implements it. The composition root connects the two at startup.

Only plain data crosses ring boundaries: primitives, plain objects, contract DTOs, domain types. Nothing that keeps a
reference to the framework, the ORM or a connection.

## Domain ring

**Contains:** business rules as pure functions or small classes, domain types and enums, invariants, state
transitions, calculations, module-specific domain errors.

**May import:** other domain code, the module's `constants.ts`, shared contract types (`import type`), the shared
error classes.

**Must not:** do I/O (DB, network, file system, child processes, timers), read `process.env`, call `Date.now()` or
random directly (take `now` / ids as arguments), import Fastify, Drizzle, Zod, SDKs, the DI container or any
application/adapter file.

**Test:** plain unit tests with literal inputs; no mocks.

```ts
// modules/reviews/domain.ts
export type Verdict = 'pass' | 'warn' | 'block';

export function verdictFor(findings: { severity: 'info' | 'warning' | 'blocker' }[], failOn: 'blocker' | 'warning'): Verdict {
  if (findings.some((f) => f.severity === 'blocker')) return 'block';
  if (failOn === 'warning' && findings.some((f) => f.severity === 'warning')) return 'block';
  return findings.length > 0 ? 'warn' : 'pass';
}
```

Not every module has a domain ring. "Validate, store, return" needs none; the first rule that is more than that does.

## Application ring

**Contains:** use cases (one method per user intention: `createAgent`, `runReview`, `syncPulls`), the transaction
boundary, orchestration across ports, authorization decisions that need data, and `ports.ts` with the interfaces the
use cases need.

**May import:** domain, its own ports, shared contracts and port interfaces, shared errors, another module's
`index.ts`.

**Must not:** import Fastify, Drizzle, `db/*`, SDKs, adapters or the DI container; know about HTTP (status codes,
headers, `reply`); parse raw request bodies.

**Shape:** a class whose constructor takes explicit dependencies, or plain functions taking a `deps` object.

```ts
// modules/agents/service.ts
export interface AgentsServiceDeps {
  agents: AgentsStore;          // port (ports.ts) — or the concrete repository class in onion-lite
  llm: (provider: Provider) => Promise<LLMProvider>;
}

export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}

  async create(workspaceId: string, input: CreateAgentInput, userId: string): Promise<Agent> {
    return this.deps.agents.insert(workspaceId, { ...input, createdBy: userId });
  }
}
```

Read-decide-write is the default use-case shape: load everything the decision needs through ports, call pure domain
functions, then persist and notify. When loading everything up front is too expensive, keep the domain pure and let
the use case make the I/O-dependent part of the decision (purity over completeness).

## Adapter ring

**Driving adapters** turn an outside trigger into a use-case call: Fastify routes, job handlers registered with the
job runner, SSE endpoints, CLI scripts, tests. They parse input, resolve the request context, call one use case and
shape the output. No rules, no queries.

**Driven adapters** implement ports for the inner rings: repositories (Drizzle), SDK adapters (`src/adapters/*`),
the event bus, the clock. They translate between the outside model and the inner model and contain no business
rules.

Adapters may import inner rings, never the other way round. Adapters of one module don't import adapters of another.

## Composition root

The only code that knows concrete classes and the DI container:

- `platform/container.ts` — builds shared infrastructure and external adapters, lazily, with test overrides.
- `app.ts` — builds the Fastify instance, registers infrastructure plugins, the error handler and modules.
- the module's plugin function (top of `routes.ts`, or `composition.ts`) — builds the module's repository and
  service from the container and hands them to the route handlers.
- `modules/index.ts` — the static module registry.

Composition roots may import anything. Nothing imports a composition root except the entry point (and tests).

## Module layouts

**Onion-lite** (CRUD, today's default):

```
modules/<name>/
├── routes.ts        # plugin: wiring + handlers + Zod schemas (move schemas to schemas.ts when long)
├── service.ts       # use cases
├── repository.ts    # Drizzle; returns contract DTOs / module types
├── helpers.ts       # pure module-local functions (no db, no Fastify)
└── constants.ts
```

**Full onion** (module with real rules):

```
modules/<name>/
├── routes.ts · schemas.ts
├── service.ts
├── ports.ts         # interfaces the service needs (only those with a second implementation or a fake)
├── domain.ts        # rules, invariants, domain types and errors
├── repository.ts · mappers.ts
├── constants.ts
└── index.ts         # public API for other modules (only if someone needs it)
```

**Ring folders** (past ~8–10 files):

```
modules/<name>/
├── domain/          # one file per concept
├── application/     # service(s), ports.ts
├── infrastructure/  # repository/, mappers, module-specific adapters
├── http/            # routes.ts, schemas.ts
├── constants.ts
└── index.ts
```

A feature-specific pipeline (e.g. an indexer) is application code if it orchestrates ports, adapter code if it
touches the file system or tools directly — split it along that line rather than keeping a mixed `pipeline/`.

## Public API between modules

- A module talks to another module only through that module's `index.ts` or through a facade interface exposed on
  the container.
- `index.ts` exports a contract: types, constants, a port interface, maybe a pure function. Explicit named exports,
  never `export *`, never the service class, repository or routes plugin.
- A module writes only its own tables. Reading another module's data goes through its facade or a read-only query it
  exposes.
- If two modules keep needing each other's internals, the boundary is wrong: merge them or move the shared concept to
  the shared kernel.

## Shared kernel

Small, stable, framework-free code every module may import:

- shared contract types and port interfaces (a shared contracts package; if it is copied, all copies kept in sync);
- the error classes (`platform/errors.ts`);
- `modules/_shared` (request-context type and helper, common Zod params). `_shared/context.ts` is HTTP-facing and
  may only be imported by routes.

Grow it reluctantly. A helper used by two modules is not automatically kernel material.

## Errors

- Inner rings throw the shared error family (`AppError`, `NotFoundError`, `ValidationError`,
  `ExternalServiceError`, `ConfigError`) or module subclasses of `AppError`; the global error handler turns them into
  the response envelope. The HTTP status carried by `AppError` is metadata for that handler, not something a service
  reasons about.
- Never `reply.code()`, `reply.send()` or HTTP header logic in a service; never catch-and-reshape in a route.
- Expected business outcomes that the caller branches on (e.g. "nothing to review") are return values, not
  exceptions. A `Result` type is optional; a discriminated union is enough.
- Driven adapters translate SDK/driver errors into the shared family (`ExternalServiceError`, `NotFoundError`) so
  inner rings never see an Octokit or Postgres error class.
- Programmer errors (bugs) are not wrapped; let them reach the handler as 500.

## Which model type flows where

| Type | Born in | May travel to | Never travels to |
|---|---|---|---|
| Raw request (`req.body`, headers) | Fastify | route handler only | service, domain |
| Parsed request input (from Zod schema) | route | service (as a plain object) | repository |
| Contract DTO (shared contracts package) | repository mapper or service | route response, other modules | — |
| Domain type | domain | service, repository mapper | route response without mapping when it differs from the contract |
| Drizzle row (`$inferSelect`) | repository | repository, mappers | service, domain, routes |
| SDK response type | adapter | adapter only | anything else |

Onion-lite modules may use the contract DTO as their only model; that is a deliberate simplification, not a leak.

## Worked example: one use case, wrong and right

**Incorrect** — the route does everything and leaks every layer:

```ts
app.post('/repos/:id/refresh', async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  const [repo] = await app.container.db.select().from(t.repos)
    .where(and(eq(t.repos.id, req.params.id), eq(t.repos.workspaceId, workspaceId)));
  if (!repo) return reply.code(404).send({ error: 'not found' });
  if (repo.status === 'cloning') throw new Error('busy');           // business rule in a route
  await app.container.db.update(t.repos).set({ status: 'cloning' }).where(eq(t.repos.id, repo.id));
  await app.container.jobs.enqueue('clone', { repoId: repo.id });   // orchestration in a route
  return repo;                                                       // raw row as the response
});
```

**Correct** — each ring does one job:

```ts
// domain.ts
export function assertCanRefresh(repo: { status: RepoStatus }): void {
  if (repo.status === 'cloning') throw new AppError('repo_busy', 'Repository is already being cloned', 409);
}

// service.ts
async refresh(workspaceId: string, repoId: string): Promise<Repo> {
  const repo = await this.deps.repos.getById(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repository not found');
  assertCanRefresh(repo);                                   // decide (pure)
  const updated = await this.deps.repos.setStatus(workspaceId, repoId, 'cloning');
  await this.deps.jobs.enqueue(CLONE_JOB_KIND, { repoId }); // side effect after the write succeeded
  return updated;
}

// routes.ts
app.post('/repos/:id/refresh', { schema: { params: IdParams, response: { 200: RepoSchema } } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.refresh(workspaceId, req.params.id);
});
```

## Anti-patterns

- **Service locator:** `constructor(private container: Container)` — dependencies are invisible and the service can
  reach anything. Pass what it needs.
- **Fat routes:** queries, rules and multi-step writes in handlers.
- **Anemic pass-through everywhere:** a service method that only forwards to the repository is fine in onion-lite; a
  port + interface + fake for every such method is ceremony.
- **Interface for every class:** add a port when there is a second implementation or a test that needs a fake.
- **Leaky repository:** returning query builders, rows, or accepting `SQL` fragments from the service.
- **Cross-module reach-in:** importing `../other/constants.js` or `../other/repository.js`.
- **Shared dumping ground:** moving code to `_shared` or `platform/` to dodge the cross-module rule.
- **Big-bang restructure:** moving every module into ring folders in one PR.

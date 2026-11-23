# Ports, adapters and dependency injection

## Contents
- Ports: who owns the interface
- Shared ports vs module ports
- SDK adapters as anti-corruption layers
- The composition root
- Explicit dependencies, not a service locator
- Lazy and secret-backed adapters
- Clock, ids and other hidden inputs
- Facades between modules
- Pure engines as the innermost core
- When not to add a port
- Checklist

## Ports: who owns the interface

A port is an interface **declared by the ring that uses it** and shaped by that ring's needs: method names in its
vocabulary, inputs and outputs in its types. The adapter adapts to the port, never the other way round. A port that
mirrors an SDK's API (`createIssueComment(owner, repo, issue_number, body)` with Octokit's option bag) is not a port,
it is a leak.

Name ports by purpose (`GitHubClient`, `AgentsStore`, `TransactionRunner`, `Clock`), not by technology
(`OctokitWrapper`, `PgRepo`).

## Shared ports vs module ports

- **Shared ports** — capabilities several modules need from the outside world (LLM provider, GitHub, git, code index,
  embedder, auth, secrets) — live in the shared adapters contract. Changing them changes both copies of the shared
  package in one commit.
- **Module ports** — what one module's use cases need (its store, a transaction runner, a notifier) — live in that
  module's `ports.ts`.
- A port moves from a module to the shared contract only when a second module needs the same capability.

## SDK adapters as anti-corruption layers

Every external SDK or native tool (Octokit, OpenAI/Anthropic SDKs, simple-git, ripgrep, ast-grep, tokenizer,
dependency-cruiser) lives in `src/adapters/<tech>/` and implements a port:

- translate SDK types to contract types; nothing SDK-shaped crosses the port;
- translate SDK/HTTP errors to the shared error family (`ExternalServiceError`, `NotFoundError`, `ConfigError`);
- handle protocol concerns there: pagination, rate limits, retries, timeouts, auth headers;
- no business rules (which findings to post, which files to index) — that is the caller's decision;
- an in-memory or mock implementation of the same port lives with the other mocks and is what tests inject.

Adapters never import feature modules. Constants an adapter needs (file extensions, size limits) are passed in via
its constructor/options or live in the shared kernel, not imported from a module's `constants.ts`.

## The composition root

The composition root decides which implementation backs each port:

- `platform/container.ts` builds infrastructure and external adapters once per app instance, lazily, with
  `overrides` for tests;
- each module's plugin function builds the module's repository and service from the container;
- CLI entrypoints compose what they need themselves.

Nothing else constructs adapters or repositories. A service never does `new SomeRepository(db)` or
`new OctokitGitHubClient(token)`.

## Explicit dependencies, not a service locator

Passing the whole container to a service (`constructor(private container: Container)`) is a service locator: the
service's real dependencies are hidden, it can reach any adapter later, and every test must build a whole container.

New services declare what they use:

```ts
export interface ReviewServiceDeps {
  reviews: ReviewRepository;              // concrete class in onion-lite, a port in full onion
  agents: AgentsReader;                   // facade/port of another module
  llm: (id: ProviderId) => Promise<LLMProvider>;
  runBus: RunEventPublisher;
  clock?: () => Date;
}

export class ReviewService {
  constructor(private readonly deps: ReviewServiceDeps) {}
}
```

Existing services that take the container are legacy: don't copy the pattern in a new service. A change that only
extends such a service (a new method, a fix) may keep the container argument; a review reports it as a migration
note, not a blocker. Replace it in a dedicated refactor (Workflow C), or when the change rewrites the service's
constructor and wiring anyway.

Hand-written wiring is enough at this size. A DI container library (Awilix / `@fastify/awilix` with request scopes)
is an option only if wiring becomes a maintenance problem; it does not change the rules above.

## Lazy and secret-backed adapters

Adapters that need a secret (API keys, tokens) are resolved on use so a missing key fails only the feature that
needs it and a changed key is picked up after cache invalidation. Inject them as async factories
(`llm: (id) => container.llm(id)`) rather than resolved instances.

## Clock, ids and other hidden inputs

`Date.now()`, `crypto.randomUUID()` and `Math.random()` are inputs. Domain functions take them as arguments; use
cases may get a `clock` / `ids` dependency when a test needs determinism. Don't inject them everywhere by default.

## Facades between modules

A module that serves others exposes a narrow facade interface (in its `index.ts` or the shared contract) and an
implementation built by the composition root. Consumers depend on the interface and get the instance from the
container. The facade decides its degraded behavior (empty results, `degraded` flag) so consumers don't need to know
its internals.

## Pure engines as the innermost core

A separate pure package (e.g. an engine: input → prompt → LLM → validated output) is the innermost ring for
its domain. It receives every capability (LLM provider, cost estimator) through parameters and has no database, file
system, network or environment access. The server adapts to it: loads data, calls the engine, persists the result.
Never add I/O to the engine to save a parameter.

## When not to add a port

- The dependency is the module's own database and the use case has no rules worth testing without it → inject the
  concrete repository; test with real Postgres.
- There is exactly one implementation, no fake is needed, and no other module depends on it.
- The "port" would just re-export the adapter's methods one-to-one.

Add the port when one of these stops being true.

## Checklist

```
- [ ] Interface declared by the consumer ring, named by purpose, in its vocabulary
- [ ] SDK types and errors translated inside the adapter
- [ ] Adapter has no business rules and imports no module
- [ ] Concrete classes chosen only in the composition root
- [ ] Service constructor lists explicit dependencies (no Container)
- [ ] Secret-backed adapters injected as lazy factories
- [ ] Port added only where a fake, a second implementation or another module needs it
```

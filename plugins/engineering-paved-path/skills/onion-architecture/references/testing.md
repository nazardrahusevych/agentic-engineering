# Testing per ring

The onion pays off in tests: each ring has one natural kind of test. This file says which test belongs to which
ring and what to fake. How to write Vitest tests and Fastify `inject()` calls is in the library skills.

## Contents
- What to fake: managed vs unmanaged dependencies
- Domain tests
- Use-case tests
- Repository tests
- Route (HTTP) tests
- Adapter tests
- Where tests live and how they are named
- Anti-patterns

## What to fake: managed vs unmanaged dependencies

- **Managed** dependencies are owned by this app and observed by nobody else — the application database. Use the
  real thing (Postgres in a container). Mocking it couples tests to queries and hides real bugs (constraints,
  transactions, scoping).
- **Unmanaged** dependencies are observed by the outside world — GitHub writes, outbound messages, LLM calls (they
  cost money and are nondeterministic). Replace them with fakes/mocks through the container overrides and assert the
  calls that matter (a comment was posted).
- **Read-only externals** (listing models, fetching a PR) get stubs that return canned data; don't assert on the
  calls.
- Collaborators inside the app (domain functions, mappers, the service's own helpers) are never mocked.

## Domain tests

- Plain unit tests: literal input → expected output or thrown domain error. No mocks, no container, no database.
- Cover the rules exhaustively here (edge cases, invariants); this is the cheapest place to do it.
- If a domain test needs a mock, something impure leaked into the domain.

## Use-case tests

Two valid styles; pick per module:

- **With real Postgres** (onion-lite default): build the service with the real repository on a Testcontainers
  database and fake external ports. Name the file `*.it.test.ts`. Assert outcomes (state in the DB, returned DTO,
  calls to unmanaged fakes), not internal calls.
- **With in-memory ports** (full onion): when the module has a repository port, an in-memory implementation lets
  you test rules and orchestration in milliseconds. Keep the fake honest — same scoping and ordering semantics — and
  cover the real repository separately.

Transactions: test that a failure in the second write leaves the first one rolled back (real Postgres only).

## Repository tests

- Against real Postgres, through the public methods: insert via the repository, read back the mapped model.
- Always include a tenant-isolation case: data of workspace B is invisible to queries for workspace A.
- Mapping edge cases (nulls, old JSON documents, enum values) belong here.

## Route (HTTP) tests

- Build the app with the factory and test overrides; call routes with `inject()`; no port is opened.
- Assert status codes, response bodies matching the response schema, validation errors (malformed params/body) and
  the error envelope for domain errors.
- Don't re-test business rules through HTTP; one happy path and the error mapping per route is enough.

## Adapter tests

- SDK adapters: test the translation (SDK response → contract type, SDK error → shared error) with recorded
  responses or a local fake server; don't call the real service in CI.
- Mock implementations used by other tests must stay faithful to the port contract; a small shared contract test
  run against both the real adapter (where possible) and the mock keeps them aligned.

## Where tests live and how they are named

Follow the package's existing layout (e.g. a `test/` folder, with `*.it.test.ts` for anything that needs Postgres or
Docker, so the unit run stays Docker-free). Name tests by behavior, not by layer.

## Anti-patterns

- Mocking the database or the ORM in service tests.
- Asserting that a service called a repository method with certain arguments instead of asserting the outcome.
- Booting the whole app to test a pure rule.
- Real network calls to GitHub or an LLM in CI.
- Domain tests that need fakes.

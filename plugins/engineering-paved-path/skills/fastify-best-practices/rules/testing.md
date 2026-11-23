---
name: testing
description: Testing a Fastify API with Vitest, buildApp() + inject(), container overrides and Testcontainers
metadata:
  tags: testing, inject, vitest, integration, unit, testcontainers
---

# Testing the API

What to test and which suite it belongs to is decided by the project's testing guide (if any). Per-ring advice (pure domain tests, use cases with fakes, repositories on real Postgres) is in
`onion-architecture` → `references/testing.md`. This file covers the Fastify mechanics.

## Runner and layout

- **Vitest** (`import { describe, it, expect, vi } from 'vitest'`), never `node:test`.
- Keep integration tests distinguishable by name: e.g. a test that imports `test/helpers/pg.ts` (real Postgres) is
  named `*.it.test.ts`; everything else is a unit test.
- Then unit tests run with `vitest run --exclude '**/*.it.test.ts'` and integration tests with
  `vitest run .it.test` (needs Docker).

## Route tests: buildApp() + inject()

`buildApp()` builds the real app without opening a port. Pass a test config and override every external adapter
through the container so no test reaches a third-party API, a CLI or an LLM:

```typescript
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('settings routes (no DB)', () => {
  it('POST /settings/test-connection returns a structured result', async () => {
    const app = await buildApp({ config, overrides: { github: new MockGitHubClient({ login: 'octocat' }) } });
    const res = await app.inject({ method: 'POST', url: '/settings/test-connection', payload: { provider: 'github' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ provider: 'github', ok: true });
    await app.close();
  });
});
```

- `NODE_ENV: 'test'` silences logs and disables the global rate limit.
- Keep mock adapters in one place (e.g. `src/adapters/mocks.ts`: `MockLLMProvider`, `MockGitHubClient`, …). Add a
  mock there when a new port appears; don't `vi.mock()` adapter modules.
- postgres-js connects lazily, so routes that never query the database can be tested without Docker.
- Always `await app.close()` (or close in `afterAll`).

## What a route test asserts

- the status code and the `{ error: { code, message, details } }` envelope for failures (422 for validation,
  404 for unknown or other-tenant ids);
- the response shape (it must pass the route's response schema — a mismatch surfaces as a 500);
- that the right adapter was called when that is the behavior (e.g. a comment was posted through the mock).

Business rules are tested in domain/use-case tests, not through HTTP.

```typescript
it('rejects an invalid id with 422', async () => {
  const res = await app.inject({ method: 'GET', url: '/agents/not-a-uuid' });
  expect(res.statusCode).toBe(422);
  expect(res.json().error.code).toBe('validation_error');
});
```

## Integration tests with a real Postgres

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /agents/:id/versions', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg(); // e.g. postgres:16 (or pgvector/pgvector:pg16), migrated
    await seed(pg.handle.db); // if auth needs a default workspace + user
  });
  afterAll(async () => pg?.stop());

  it('a new agent has exactly one version', async () => {
    const app = await buildApp({ config, db: pg.handle.db, overrides: { git: new MockGitClient(), github: new MockGitHubClient() } });
    const created = await app.inject({ method: 'POST', url: '/agents', payload: createBody });
    expect(created.statusCode).toBe(201);
    // …
  });
});
```

- One container per file (`beforeAll`), seeded once; tests create the rows they need and don't depend on order.
- Don't wrap tests in transactions to roll back — the app opens its own connections, so isolation comes from
  per-file containers and unique data.
- Cross-tenant checks: create a second workspace in the test and assert 404, not 403.

## Streams (SSE)

`inject()` buffers the whole response, so it suits only streams that end. Test the event bus and the use case that
publishes events directly; keep SSE route tests to "subscribes and ends when the job is done".

## Don't

- Mixing runners (`node --test`, `t.assert`) into a Vitest suite, or `app.decorate('db', mock)` instead of container
  overrides.
- Hitting real third-party/LLM endpoints or reading real keys; tests must pass with no secrets.
- Sleeping for async work; await the use case or poll the repository with a timeout.

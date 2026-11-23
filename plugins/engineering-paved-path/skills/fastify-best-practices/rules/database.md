---
name: database
description: How a Fastify API reaches Postgres (Drizzle client in the DI container, repositories, lifecycle)
metadata:
  tags: database, postgres, drizzle, lifecycle
---

# Database Integration

This setup does **not** use `@fastify/postgres` (or any `@fastify/*` database plugin) and does not decorate the
instance with a pool. The database is a dependency in the DI container:

- `createDb(databaseUrl)` (e.g. `src/db/client.ts`) builds a **Drizzle** client over **postgres-js**
  (`postgres` package, a bounded pool such as `max: 10`) and returns `{ db, sql, close }`.
- `buildApp()` creates one handle, passes `db` into the `Container`, and closes it in an `onClose` hook.
  Tests pass their own `db` (Testcontainers) through `buildApp({ db })`.
- Modules get the client from `app.container.db` **in their composition root** (the top of the module plugin) and
  hand it to repositories. Routes, services and domain code never import `drizzle-orm` or `db/*`.

Placement and transactions: `onion-architecture` (`references/persistence-drizzle.md`).
Query and schema syntax: `drizzle-orm-patterns`. Table design: `postgresql-table-design`.

## Lifecycle

- **Readiness:** `GET /health/ready` runs `select 1` and returns 503 when the database is unreachable; liveness
  (`/health`) never touches the database.
- **Shutdown:** `server.ts` closes the app on `SIGTERM`/`SIGINT`; the `onClose` hook ends the postgres-js pool.
  A module that opens its own long-lived resource registers its own `onClose`.
- **Migrations**: decide explicitly whether they run on boot or as a separate step (e.g. a `db:migrate` script), and
  document it. If auth or defaults depend on seed data, the seed step is required too.

## Repositories, not `request.server.db`

```typescript
// modules/agents/routes.ts — composition root of the module
const { db } = app.container;
const service = new AgentsService({ agents: new AgentsRepository(db) });

// modules/agents/repository.ts — the only module file that imports Drizzle
export class AgentsRepository {
  constructor(private readonly db: Db) {}

  async listEnabled(workspaceId: string): Promise<AgentModel[]> {
    const rows = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    return rows.map(toAgentModel);
  }
}
```

- Every tenant query filters by `workspaceId`.
- Several writes that must succeed together run in one transaction owned by the use case.
- No hand-built SQL strings from request data; Drizzle's `sql` template binds parameters, `sql.raw()` never takes
  user input.

## Caching

Cache only when there is a measured need, and keep the cache inside the adapter or service that owns it (e.g. a
lazily cached auth user/workspace inside the auth adapter).

## Testing with the database

Integration tests start a real Postgres with Testcontainers (e.g. a `test/helpers/pg.ts` helper), migrate and
seed it, and drive routes through `app.inject()`. Name files that need it distinctly (e.g. `*.it.test.ts`) and let
them skip when Docker is unavailable. See `testing.md`.

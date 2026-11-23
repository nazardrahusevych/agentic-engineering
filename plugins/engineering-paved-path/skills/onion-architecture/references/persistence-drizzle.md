# Drizzle as the driven adapter

The database is a detail behind the repository. This file says where Drizzle code lives, what crosses the
repository boundary and how transactions are owned. Query syntax is in `drizzle-orm-patterns`, table design in
`postgresql-table-design`.

## Contents
- Where Drizzle may appear
- Repository shape
- Mapping: rows in, models out
- Tenant scoping
- Ports for repositories: when to add an interface
- Transactions (unit of work)
- Reads that only feed a response
- Stored JSON and other untrusted columns
- Schema and migrations
- Anti-patterns

## Where Drizzle may appear

`drizzle-orm`, the table definitions (`db/schema`), the row types (`db/rows`) and the database client type appear
only in:

- the module's `repository.ts`, `repository/*.repo.ts`, `mappers.ts` or `infrastructure/`;
- infrastructure in `platform/` that owns its own table (job runner, health check);
- composition roots and CLI entrypoints (migrate, seed).

Services, domain files and routes never import them — not even `import type { AgentRow }`.

## Repository shape

- One repository class per aggregate or per module in onion-lite; constructor takes the database executor.
- Methods are named in domain language (`listEnabled`, `getActiveRunForPull`, `markFailed`), not generic CRUD over
  any table.
- Every method that touches tenant data takes `workspaceId` and filters by it.
- A repository contains no business rules. "Which agents may run" is a use-case/domain decision; the repository
  offers `listEnabled(workspaceId)`.
- A repository writes only its module's tables. Shared repositories exposed on the container (e.g. for agents or
  runs) are read through their public methods by other modules, never extended from outside.

```ts
export class AgentsRepository {
  constructor(private readonly db: DbExecutor) {}

  async listEnabled(workspaceId: string, exec: DbExecutor = this.db): Promise<Agent[]> {
    const rows = await exec.select().from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(asc(t.agents.name));
    return rows.map(toAgent);
  }
}
```

## Mapping: rows in, models out

- Rows (`$inferSelect`) describe storage: camelCase columns, nullable timestamps, JSON blobs. They are mapped
  before leaving the repository — to the contract DTO in onion-lite modules, to the domain type in full-onion modules.
- Keep the mapper next to the repository (`mappers.ts` or private functions in `repository.ts`): `toModel(row)`,
  `toInsert(input)`. A `helpers.ts` that imports the schema is persistence code and belongs with the repository.
- Insert/update inputs are typed with the module's own input types, not with `$inferInsert`, so the service never
  learns column names.
- Value conversions (Date ↔ ISO string, numeric strings ↔ numbers, enums) happen in the mapper, once.

## Tenant scoping

- `workspaceId` comes from the request context, travels through the use case as a plain argument and reaches every
  query. A method without a scope parameter is either global data by design (say so in its name/comment) or a bug.
- Child rows (versions, links) are read only after the parent was loaded with the scope, or with a join on the
  scoped parent.

## Ports for repositories: when to add an interface

- **Onion-lite:** the service depends on the concrete repository class, injected through the constructor. Tests use
  real Postgres (Testcontainers), which is the right fake for a managed database.
- **Add a port** (`ports.ts`) when a use case has rules worth testing without a database, when there is a second
  implementation (cache, other store), or when another module must depend on the capability. The interface lists
  only the methods the use case needs, in its vocabulary.

```ts
// ports.ts — owned by the application ring
export interface AgentsStore {
  listEnabled(workspaceId: string): Promise<Agent[]>;
  getById(workspaceId: string, id: string): Promise<Agent | undefined>;
}
```

## Transactions (unit of work)

Several writes that must succeed or fail together form one transaction. The **use case owns the boundary**; Drizzle
mechanics stay in the adapter.

```ts
// ports.ts (application) — no Drizzle types
export interface TransactionRunner<Tx = unknown> {
  run<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}

// infrastructure (adapter): wraps Drizzle
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
export const drizzleTransactions = (db: Db): TransactionRunner<DbExecutor> => ({
  run: (work) => db.transaction((tx) => work(tx)),
});

// service.ts (application)
await this.deps.tx.run(async (tx) => {
  await this.deps.pulls.replaceFiles(workspaceId, pullId, files, tx);
  await this.deps.pulls.replaceCommits(workspaceId, pullId, commits, tx);
});
```

Rules:

- Repository methods that can take part in a transaction accept an optional executor and run on `exec ?? this.db`.
- Delete-and-reinsert, "insert parent then children", and "update status then write audit row" always run in one
  transaction.
- Keep transactions short: no LLM/GitHub calls, no file system work inside. Fetch first, then open the transaction to
  write.
- Side effects outside the database (enqueue a job, publish an SSE event, post a GitHub comment) happen **after** the
  transaction commits.
- Aborting: throw from the callback (a domain error is fine); don't leak the driver's rollback error to inner rings.
- Nested `tx.transaction(...)` becomes a savepoint; use it only for a deliberately partial rollback.

## Reads that only feed a response

Lists, dashboards and reports that just shape data for a screen may skip the domain: the repository exposes a query
method that returns the response DTO directly (joins, aggregates, pagination in SQL). The use case is then a thin
pass-through or the route calls it via the service — never a Drizzle query in the route.

## Stored JSON and other untrusted columns

JSON columns, documents written by older code and anything another process writes are outside data. Parse them with
a schema in the mapper (tolerant: new fields optional/nullish, defaults for missing ones) instead of casting
`row.trace as RunTrace`. See [zod-boundaries.md](zod-boundaries.md).

## Schema and migrations

Tables live in the shared schema folder and are an adapter concern. A schema change follows the project's generate →
migrate flow; never hand-edit an applied migration. The domain does not change because a column was renamed — only
the mapper does.

## Anti-patterns

- Drizzle queries in routes or services; `import type { …Row }` in a service.
- Repository returning query builders, raw rows, or accepting `SQL` fragments built by the caller.
- Generic `BaseRepository<T>` with `findAll/findById/update` over any table.
- One repository per table forcing the service to stitch aggregates together; or one repository writing several
  modules' tables.
- Multi-step writes without a transaction; external calls inside a transaction.
- Unscoped tenant queries.

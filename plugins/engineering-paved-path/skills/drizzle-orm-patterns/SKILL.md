---
name: drizzle-orm-patterns
description: Drizzle ORM 0.38 on PostgreSQL for a TypeScript backend — schema files per domain, uuid keys, workspace-scoped repository queries, joins and aggregations, upserts and batches, transactions with an executor, relations (v1 API only), pgvector, and the generate → migrate flow with drizzle-kit. Use when writing or reviewing a table definition, a repository query, a transaction or a migration. Where Drizzle code may live is decided by onion-architecture; table design by postgresql-table-design.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Drizzle ORM Patterns

## Assumed stack

Versions and layout are examples — adapt to your project (check its CLAUDE.md / AGENTS.md, if any).

- **drizzle-orm 0.38**, **drizzle-kit 0.30**, PostgreSQL 16 (optionally pgvector), driver **postgres-js**
  (`postgres` package) via `drizzle-orm/postgres-js`. The patterns assume PostgreSQL, not MySQL/SQLite.
- Client: `createDb(url)` (e.g. `src/db/client.ts`) → `{ db, sql, close }`; the app keeps one in the DI container.
- Schema: `src/db/schema/<domain>.ts`, re-exported by `src/db/schema.ts`; row types in `src/db/rows.ts`; migrations
  in `src/db/migrations/` (generated).
- Commands (package scripts wrapping drizzle-kit): `db:generate` → review SQL → `db:migrate`; `db:seed`.
  **Never `push`.**
- Drizzle code (`drizzle-orm`, `db/schema`, `db/rows`, `Db`) appears only in repositories, mappers, platform
  infrastructure and CLI entrypoints — never in routes, services or domain files (`onion-architecture`).

## Quick reference

| Task | Pattern |
|---|---|
| Primary key | `uuid('id').primaryKey().defaultRandom()` |
| Tenant column | `workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' })` |
| Timestamp | `timestamp('x_at', { withTimezone: true })`; `created_at` via a shared `now()` helper (e.g. `schema/_shared.ts`) |
| Enumerated text | `text('status', { enum: ['queued', 'running', 'done'] })` |
| Select | `db.select({ … }).from(t.x).where(and(eq(t.x.workspaceId, ws), …))` |
| Upsert | `.onConflictDoUpdate({ target: [...], set: { col: sql\`excluded.col\` } })` |
| Count | `db.$count(t.x, where)` |
| Transaction | use case → `TransactionRunner.run(tx => …)`; repository methods take `exec = this.db` |

## Example: a scoped repository method

```typescript
import { and, eq, desc } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { Db } from '../../db/client.js';

export class AgentsRepository {
  constructor(private readonly db: Db) {}

  async listEnabled(workspaceId: string): Promise<AgentModel[]> {
    const rows = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(desc(t.agents.createdAt));
    return rows.map(toAgentModel);
  }
}
```

## Rules

1. **Scope every tenant query** by `workspaceId` — selects, updates and deletes alike. Child tables are written
   only after the parent was loaded with the scope.
2. **Map rows** to model/contract types in the repository; `$inferSelect`/`$inferInsert` don't leave it.
3. **Select what you need** and paginate lists; prefer one join over N+1 queries.
4. **Transactions** for every multi-step write; no network, LLM or file-system calls inside one; side effects after
   commit.
5. **Parse stored JSON** (`jsonb`) with Zod in the mapper; new fields `.nullish()`.
6. **Parameters only:** `sql\`…${value}\`` binds values; `sql.raw()` never receives request, repo or LLM data.
7. **Migrations:** schema change + generated migration in one commit; never edit an applied migration; no `push`.
8. **Relations:** optional; if needed, `relations()` (v1). `defineRelations()` is Drizzle 1.0 and
   doesn't exist in 0.38.
9. **Deletes** are hard deletes with FK cascades; soft delete only when restore or audit is required.

## Constraints and warnings

- `sum`/`avg` return strings — `.mapWith(Number)`.
- `tx.rollback()` throws; prefer throwing a domain error from the callback.
- Large inserts: chunk to stay under Postgres' 65 535 bind parameters.
- `inArray` with a user-built list: cap its size.
- If the rest of the code uses `.js` import extensions, imports inside `src/db/schema/` may still need to be
  extensionless for drizzle-kit to load them; follow what the project's schema folder does.

## References

- [references/schema-definition.md](references/schema-definition.md) — table conventions, indexes, composite keys,
  column types in use
- [references/queries-joins-aggregations.md](references/queries-joins-aggregations.md) — CRUD, operators, joins,
  pagination, aggregations, raw SQL, pgvector
- [references/transactions.md](references/transactions.md) — executor pattern, rules, isolation
- [references/migrations.md](references/migrations.md) — generate → review → migrate, custom SQL, seed
- [references/common-patterns.md](references/common-patterns.md) — upsert, batches, counters, version snapshots,
  deletes, types, search
- [references/relations.md](references/relations.md) — when to use relations and the v1 `relations()` API

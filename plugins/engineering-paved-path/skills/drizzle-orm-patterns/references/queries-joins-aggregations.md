# Queries, Joins and Aggregations

All queries live in repositories (`modules/<name>/repository.ts` or `repository/*.repo.ts`) and receive
`workspaceId` from the use case. Tables come from `import * as t from '../../db/schema.js'`.

## CRUD

```typescript
import { and, eq, desc } from 'drizzle-orm';

// insert … returning
const [row] = await this.db
  .insert(t.agents)
  .values({ workspaceId, name: input.name, provider: input.provider, model: input.model, systemPrompt: input.systemPrompt })
  .returning();

// select only the columns you need, always scoped
const rows = await this.db
  .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
  .from(t.agents)
  .where(eq(t.agents.workspaceId, workspaceId))
  .orderBy(desc(t.agents.createdAt));

// first match
const [agent] = await this.db
  .select()
  .from(t.agents)
  .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
  .limit(1);

// update / delete — the WHERE always includes the scope
await this.db.update(t.agents).set({ enabled: false }).where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
await this.db.delete(t.agents).where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));

// count
const total = await this.db.$count(t.agents, eq(t.agents.workspaceId, workspaceId));
```

- Map rows to the module's model / contract type before returning (`toAgentModel(row)`); never return raw rows or
  query builders from a repository.
- `update`/`delete` without the scope in `WHERE` are bugs even when the id is a uuid.

## Operators

`eq, ne, gt, gte, lt, lte, like, ilike, inArray, notInArray, isNull, isNotNull, between, and, or, not, exists`
from `drizzle-orm`. Notes:

- `inArray(col, [])` with an empty array is valid in Drizzle (it yields `false`), but skip the query when the
  input is empty anyway.
- `ilike` with user input: escape `%` and `_`, or the user controls the pattern.
- Conditional filters: build an array and spread it — `where(and(eq(t.x.workspaceId, ws), ...extra))`;
  `and()` ignores `undefined` entries.

## Joins

```typescript
// a read that only feeds a response may return the DTO straight from SQL
const rows = await this.db
  .select({
    runId: t.agentRuns.id,
    status: t.agentRuns.status,
    agentName: t.agents.name,
  })
  .from(t.agentRuns)
  .innerJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
  .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)));
```

- Scope by the `workspaceId` of the root table of the query (both tables carry one here).
- Self-joins: `alias(t.table, 'parent')` from `drizzle-orm/pg-core`.
- Prefer one join over N+1 loops of single-row selects.

## Pagination

- Offset (`.limit(n).offset((page - 1) * n)`) is fine for small lists.
- Large or append-only tables (event logs, history): keyset pagination on an indexed, unique ordering
  (`(created_at, id)`): `where(or(lt(t.x.createdAt, cursor.createdAt), and(eq(t.x.createdAt, cursor.createdAt), lt(t.x.id, cursor.id))))`.
- Always `orderBy` when paginating.

## Aggregations

```typescript
import { count, sum, avg, sql } from 'drizzle-orm';

const [stats] = await this.db
  .select({
    runs: count(),
    totalCost: sum(t.agentRuns.costUsd).mapWith(Number), // sum/avg return strings without mapWith
  })
  .from(t.agentRuns)
  .where(eq(t.agentRuns.workspaceId, workspaceId));
```

- `sum`/`avg` return strings (Postgres `numeric`); convert with `.mapWith(Number)` or in the mapper.
- `sql<number>\`…\`` is typed only at compile time; cast in SQL (`::int`) or `.mapWith(Number)` for runtime safety.

## Raw SQL

`sql` template literals bind every `${value}` as a parameter — safe. `sql.raw()` inserts text verbatim — never
pass request data, repo content or LLM output to it. `db.execute(sql\`…\`)` is for statements the builder cannot
express (bulk `UPDATE … FROM`, vector operators); keep them in the repository with a comment.

## pgvector

Similarity search uses the `vector` columns (1536 dims) with operators through `sql`
(`${t.codeChunks.embedding} <=> ${embedding}`), ordered and limited in SQL. Embeddings are off unless
`EMBEDDINGS_ENABLED=true`; the query path must handle "no embeddings" gracefully.

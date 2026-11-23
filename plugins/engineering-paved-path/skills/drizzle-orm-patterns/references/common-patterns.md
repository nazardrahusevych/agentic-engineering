# Common Patterns

## Upsert

```typescript
// idempotent link: insert or update the order (modules/agents/repository.ts)
await this.db
  .insert(t.agentSkills)
  .values({ agentId, skillId, order })
  .onConflictDoUpdate({
    target: [t.agentSkills.agentId, t.agentSkills.skillId],
    set: { order },
  });

// take the incoming value for several columns
await this.db
  .insert(t.settings)
  .values(rows)
  .onConflictDoUpdate({
    target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
    set: { value: sql`excluded.value` },
  });

// "insert if missing" (seed, idempotent jobs) — relies on the table's primary key / unique index
await db.insert(t.workspaceMembers).values({ workspaceId, userId, role: 'owner' }).onConflictDoNothing();
```

- The conflict target needs an exact unique index or primary key on those columns (a partial index won't do).
- Use `sql\`excluded.<column>\`` for "take the new value"; don't rebuild the values object by hand.

## Batch writes

```typescript
const CHUNK = 500; // stay well under Postgres' 65 535 bind-parameter limit
for (let i = 0; i < rows.length; i += CHUNK) {
  await exec.insert(t.symbols).values(rows.slice(i, i + CHUNK));
}
```

- Chunk by rows × columns, not by a fixed number alone, for wide tables.
- Batches that must land together run in one transaction (`transactions.md`); indexing jobs that can resume may
  commit per chunk.

## Pagination with a total

```typescript
const where = eq(t.agentRuns.workspaceId, workspaceId);
const [items, total] = await Promise.all([
  this.db.select().from(t.agentRuns).where(where).orderBy(desc(t.agentRuns.ranAt)).limit(size).offset(offset),
  this.db.$count(t.agentRuns, where),
]);
```

## Counters and conditional updates

```typescript
await this.db
  .update(t.agents)
  .set({ version: sql`${t.agents.version} + 1` })
  .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
  .returning({ version: t.agents.version });
```

Increment in SQL, never read-modify-write in TypeScript (two requests would lose an update).

## Versions and history

Keep history as **snapshot rows** written in the same transaction as the change (e.g. `agent_versions` with the
config as `jsonb`); for per-entity history this is simpler than a generic audit-log table.

## Deleting

Prefer hard deletes that rely on `onDelete: 'cascade'` / `'set null'` foreign keys. Don't add `deleted_at`
soft-delete columns unless restore or audit is required; if one does, every query of that table must filter
`isNull(t.x.deletedAt)` and the unique indexes become partial.

## Types

```typescript
// src/db/rows.ts — shared row types for repositories
export type AgentRow = typeof t.agents.$inferSelect;
```

- `$inferSelect` / `$inferInsert` are **storage** types: use them inside repositories and mappers only.
  Services and routes work with the module's model / contract types (`onion-architecture`).
- Insert inputs are typed with the module's own input type and mapped to the row in the repository.

## Search

Pick one search mechanism per use case: semantic search through pgvector, keyword search through Postgres full-text
search (a `tsvector` column with a GIN index, see `postgresql-table-design`) or an external index.

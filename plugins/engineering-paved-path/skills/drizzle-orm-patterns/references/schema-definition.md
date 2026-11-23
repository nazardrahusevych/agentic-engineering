# Schema Definition (PostgreSQL)

Tables live in `src/db/schema/<domain>.ts` and are re-exported by the barrel `src/db/schema.ts`. Shared row types
(`$inferSelect`) for repositories live in `src/db/rows.ts` (paths are examples). Design rules (types, keys,
indexes, constraints) come from `postgresql-table-design`; this file shows how to express them in Drizzle 0.38.

## A tenant table

```typescript
import { pgTable, uuid, text, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    provider: text('provider', { enum: ['openai', 'anthropic', 'openrouter'] }).notNull(),
    outputSchema: jsonb('output_schema').$type<AgentOutputSchema>(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
  },
  (t) => ({
    workspaceIdx: index('agents_workspace_idx').on(t.workspaceId),
  }),
);
```

Conventions visible in the existing tables — follow them:

- **Primary key:** `uuid('id').primaryKey().defaultRandom()` (or identity columns, if that is the project's key
  convention — see `postgresql-table-design`). Not `serial`, not `bigserial`.
- **Tenancy (if multi-tenant):** domain tables carry `workspaceId` → `workspaces.id` with `onDelete: 'cascade'`, plus `createdBy` →
  `users.id` where it matters.
- **Timestamps:** `timestamp(name, { withTimezone: true })`; `created_at` comes from a small `now()` helper in
  `schema/_shared.ts` (timestamptz, `defaultNow()`, not null).
- **Enumerated strings:** `text(name, { enum: [...] })` — a TypeScript union without a Postgres enum type, so
  adding a value needs no `ALTER TYPE`. Don't introduce `pgEnum` for values that will grow.
- **Names:** camelCase in TypeScript, snake_case in SQL (`workspaceId: uuid('workspace_id')`).
- **JSON:** `jsonb` (never `json`), typed with `.$type<T>()`. Data read back from it is still parsed with Zod in
  the repository mapper (see `zod` and `onion-architecture`).
- **Embeddings:** `vector('embedding', { dimensions: 1536 })` (pgvector; enable the extension before running
  migrations, e.g. in the migrate script).
- **Imports inside `src/db/schema/` and `src/db/schema.ts`** may need to be extensionless (`from './core'`) even if
  the rest of the code uses `.js`, because drizzle-kit loads these files directly. Follow the folder's style.

## Indexes, unique constraints, composite keys

```typescript
export const symbols = pgTable(
  'symbols',
  {
    repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    line: integer('line').notNull(),
  },
  (t) => ({
    lookupIdx: index('symbols_repo_path_idx').on(t.repoId, t.path),
    uq: uniqueIndex('symbols_repo_path_name_kind_line_uq').on(t.repoId, t.path, t.name, t.kind, t.line),
  }),
);

export const agentSkills = pgTable(
  'agent_skills',
  { agentId: uuid('agent_id').notNull(), skillId: uuid('skill_id').notNull(), order: integer('order').notNull() },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.skillId] }) }),
);
```

- Every new foreign-key column gets an index unless it is the leading column of the primary key or of another index.
- Name indexes `<table>_<columns>_idx` and unique ones `<table>_<columns>_uq`.
- The existing tables return an **object** from the third argument. Follow the neighbouring file; newer Drizzle
  versions prefer returning an array, so switch all files together if Drizzle is upgraded.
- References use arrow functions (`() => workspaces.id`); for a self-reference type the column as
  `(): AnyPgColumn => table.id`.

## Column types in use

| Need | Drizzle | Notes |
|---|---|---|
| id / foreign key | `uuid` | `defaultRandom()` on PKs |
| text of any length | `text` | no `varchar(n)`; enforce limits in Zod or a `check` |
| counts, line numbers, versions | `integer` | `bigint({ mode: 'number' })` only for values that can pass 2³¹ |
| small bounded numbers | `smallint` | e.g. percentile |
| estimates and ratios (LLM `cost_usd`, recall, percentages) | `doublePrecision` | display values, not billing |
| exact money | `numeric` | never a float |
| flags | `boolean().notNull().default(…)` | |
| time | `timestamp({ withTimezone: true })` | never without time zone |
| semi-structured data | `jsonb().$type<T>()` | parse on read |
| embeddings | `vector({ dimensions: 1536 })` | |

After changing any file here: run the generate script, review the SQL, commit both — see `migrations.md`.

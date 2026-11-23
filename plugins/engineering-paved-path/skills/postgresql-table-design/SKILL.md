---
name: postgresql-table-design
description: Use this skill when designing or reviewing a table, column, index or constraint for a PostgreSQL (16+, optionally pgvector) database, including tables declared with an ORM such as Drizzle. Covers key, tenancy and timestamp conventions, data types, indexing (including foreign keys), constraints, JSONB, pgvector, safe schema evolution and performance patterns.
---

# PostgreSQL Table Design

## Assumed stack

Versions and conventions are examples — adapt to your project (check its CLAUDE.md / AGENTS.md and existing schema).

- **PostgreSQL 16** (optionally with **pgvector**). If tables are declared in TypeScript with Drizzle and migrations
  are generated, this skill decides *what* the table looks like; `drizzle-orm-patterns` shows *how* to write it. The
  SQL below is for reasoning; the source of truth is the ORM schema.
- **One primary-key convention per project.** This skill's examples use `uuid` with `gen_random_uuid()`
  (`uuid('id').primaryKey().defaultRandom()`) — a good fit when ids cross an API and a client as strings.
  `BIGINT GENERATED ALWAYS AS IDENTITY` is the common alternative; never `serial`. Junction and per-entity child
  tables may use a composite primary key.
- **Tenancy (if the app is multi-tenant)** can be enforced in the application or with Row-Level Security. With
  application scoping, domain tables carry a tenant column such as `workspace_id` (FK → `workspaces`,
  `ON DELETE CASCADE`) and every repository query filters by it.
- **Every new foreign-key column gets an index** unless it is the leading column of the primary key or of another
  index. If existing FKs lack one, don't copy that.
- Timestamps are `timestamptz`; enumerated strings are `text` with a TypeScript enum (plus `CHECK` if critical);
  semi-structured data is `jsonb`; embeddings are `vector(<dimensions>)`.

## Core Rules

- Define a **PRIMARY KEY** on every table: the project's surrogate key (`uuid` or `BIGINT GENERATED ALWAYS AS
  IDENTITY`, see above), or a composite key for junction / per-entity child tables.
- **Normalize first (to 3NF)** to eliminate data redundancy and update anomalies; denormalize **only** for measured, high-ROI reads where join performance is proven problematic. Premature denormalization creates maintenance burden.
- Add **NOT NULL** everywhere it’s semantically required; use **DEFAULT**s for common values.
- Create **indexes for access paths you actually query**: PK/unique (auto), **FK columns (manual!)**, frequent filters/sorts, and join keys.
- Prefer **TIMESTAMPTZ** for event time; **NUMERIC** for exact money; **TEXT** for strings; **INTEGER** for bounded counts and **BIGINT** for values that can grow past 2³¹; **DOUBLE PRECISION** for estimates and ratios (LLM cost estimates, recall, rank).

## PostgreSQL “Gotchas”

- **Identifiers**: unquoted → lowercased. Avoid quoted/mixed-case names. Convention: use `snake_case` for table/column names.
- **Unique + NULLs**: UNIQUE allows multiple NULLs. Use `UNIQUE (...) NULLS NOT DISTINCT` (PG15+) to restrict to one NULL.
- **FK indexes**: PostgreSQL **does not** auto-index FK columns. Add them.
- **No silent coercions**: length/precision overflows error out (no truncation). Example: inserting 999 into `NUMERIC(2,0)` fails with error, unlike some databases that silently truncate or round.
- **Sequences/identity have gaps** (normal; don't "fix"). Rollbacks, crashes, and concurrent transactions create gaps in ID sequences (1, 2, 5, 6...). This is expected behavior—don't try to make IDs consecutive.
- **Heap storage**: no clustered PK by default (unlike SQL Server/MySQL InnoDB); `CLUSTER` is one-off reorganization, not maintained on subsequent inserts. Row order on disk is insertion order unless explicitly clustered.
- **MVCC**: updates/deletes leave dead tuples; vacuum handles them—design to avoid hot wide-row churn.

## Data Types

- **IDs**: `UUID` with `gen_random_uuid()` (PG16; `uuidv7()` needs PG18), or `BIGINT GENERATED ALWAYS AS
  IDENTITY`. With random uuids, index a `created_at` column when you need time ordering — they carry none.
- **Integers**: `INTEGER` for counts, line numbers, versions and other bounded values; `BIGINT` for values that can pass 2³¹ (byte sizes, token totals over time); `SMALLINT` only for small
  bounded values (e.g. a percentile).
- **Floats**: prefer `DOUBLE PRECISION` over `REAL` unless storage space is critical. Use `NUMERIC` for exact decimal arithmetic.
- **Strings**: prefer `TEXT`; if length limits needed, use `CHECK (LENGTH(col) <= n)` instead of `VARCHAR(n)`; avoid `CHAR(n)`. Use `BYTEA` for binary data. Large strings/binary (>2KB default threshold) automatically stored in TOAST with compression. TOAST storage: `PLAIN` (no TOAST), `EXTENDED` (compress + out-of-line), `EXTERNAL` (out-of-line, no compress), `MAIN` (compress, keep in-line if possible). Default `EXTENDED` usually optimal. Control with `ALTER TABLE tbl ALTER COLUMN col SET STORAGE strategy` and `ALTER TABLE tbl SET (toast_tuple_target = 4096)` for threshold. Case-insensitive: for locale/accent handling use non-deterministic collations; for plain ASCII use expression indexes on `LOWER(col)` (preferred unless column needs case-insensitive PK/FK/UNIQUE) or `CITEXT`.
- **Money**: `NUMERIC(p,s)` (never float).
- **Time**: `TIMESTAMPTZ` for timestamps; `DATE` for date-only; `INTERVAL` for durations. Avoid `TIMESTAMP` (without timezone). Use `now()` for transaction start time, `clock_timestamp()` for current wall-clock time.
- **Booleans**: `BOOLEAN` with `NOT NULL` constraint unless tri-state values are required.
- **Enums**: `CREATE TYPE ... AS ENUM` for small, stable sets (e.g. US states, days of week). For business-logic-driven and evolving values (e.g. order statuses) → use TEXT (or INT) + CHECK or lookup table.
- **Arrays**: `TEXT[]`, `INTEGER[]`, etc. Use for ordered lists where you query elements. Index with **GIN** for containment (`@>`, `<@`) and overlap (`&&`) queries. Access: `arr[1]` (1-indexed), `arr[1:3]` (slicing). Good for tags, categories; avoid for relations—use junction tables instead. Literal syntax: `'{val1,val2}'` or `ARRAY[val1,val2]`.
- **Range types**: `daterange`, `numrange`, `tstzrange` for intervals. Support overlap (`&&`), containment (`@>`), operators. Index with **GiST**. Good for scheduling, versioning, numeric ranges. Pick a bounds scheme and use it consistently; prefer `[)` (inclusive/exclusive) by default.
- **Network types**: `INET` for IP addresses, `CIDR` for network ranges, `MACADDR` for MAC addresses. Support network operators (`<<`, `>>`, `&&`).
- **Geometric types**: `POINT`, `LINE`, `POLYGON`, `CIRCLE` for 2D spatial data. Index with **GiST**. Consider **PostGIS** for advanced spatial features.
- **Text search**: `TSVECTOR` for full-text search documents, `TSQUERY` for search queries. Index `tsvector` with **GIN**. Always specify language: `to_tsvector('english', col)` and `to_tsquery('english', 'query')`. Never use single-argument versions. This applies to both index expressions and queries.
- **Domain types**: `CREATE DOMAIN email AS TEXT CHECK (VALUE ~ '^[^@]+@[^@]+$')` for reusable custom types with validation. Enforces constraints across tables.
- **Composite types**: `CREATE TYPE address AS (street TEXT, city TEXT, zip TEXT)` for structured data within columns. Access with `(col).field` syntax.
- **JSONB**: preferred over JSON; index with **GIN**. Use only for optional/semi-structured attrs. ONLY use JSON if the original ordering of the contents MUST be preserved.
- **Vector types**: `vector` type by `pgvector` for vector similarity search for embeddings.

### Do not use the following data types

- DO NOT use `timestamp` (without time zone); DO use `timestamptz` instead.
- DO NOT use `char(n)` or `varchar(n)`; DO use `text` instead.
- DO NOT use `money` type; DO use `numeric` instead.
- DO NOT use `timetz` type; DO use `timestamptz` instead.
- DO NOT use `timestamptz(0)` or any other precision specification; DO use `timestamptz` instead
- DO NOT use `serial` type; DO use `uuid` with `gen_random_uuid()` or `BIGINT GENERATED ALWAYS AS IDENTITY` instead.

## Table Types

- **Regular**: default; fully durable, logged.
- **TEMPORARY**: session-scoped, auto-dropped, not logged. Faster for scratch work.
- **UNLOGGED**: persistent but not crash-safe. Faster writes; good for caches/staging.

## Row-Level Security

An alternative to application-level tenant scoping. If the app connects as one database role and scopes by a tenant
column in repositories, adding RLS needs a per-request `SET` of the tenant on a reserved connection — decide it for
the whole schema, not on one table. Mechanics: `ALTER TABLE tbl ENABLE ROW LEVEL SECURITY` plus
`CREATE POLICY … USING (…)`.

## Constraints

- **PK**: implicit UNIQUE + NOT NULL; creates a B-tree index.
- **FK**: specify `ON DELETE/UPDATE` action (`CASCADE`, `RESTRICT`, `SET NULL`, `SET DEFAULT`). Add explicit index on referencing column—speeds up joins and prevents locking issues on parent deletes/updates. Use `DEFERRABLE INITIALLY DEFERRED` for circular FK dependencies checked at transaction end.
- **UNIQUE**: creates a B-tree index; allows multiple NULLs unless `NULLS NOT DISTINCT` (PG15+). Standard behavior: `(1, NULL)` and `(1, NULL)` are allowed. With `NULLS NOT DISTINCT`: only one `(1, NULL)` allowed. Prefer `NULLS NOT DISTINCT` unless you specifically need duplicate NULLs.
- **CHECK**: row-local constraints; NULL values pass the check (three-valued logic). Example: `CHECK (price > 0)` allows NULL prices. Combine with `NOT NULL` to enforce: `price NUMERIC NOT NULL CHECK (price > 0)`.
- **EXCLUDE**: prevents overlapping values using operators. `EXCLUDE USING gist (room_id WITH =, booking_period WITH &&)` prevents double-booking rooms. Requires appropriate index type (often GiST).

## Indexing

- **B-tree**: default for equality/range queries (`=`, `<`, `>`, `BETWEEN`, `ORDER BY`)
- **Composite**: order matters—index used if equality on leftmost prefix (`WHERE a = ? AND b > ?` uses index on `(a,b)`, but `WHERE b = ?` does not). Put most selective/frequently filtered columns first.
- **Covering**: `CREATE INDEX ON tbl (id) INCLUDE (name, email)` - includes non-key columns for index-only scans without visiting table.
- **Partial**: for hot subsets (`WHERE status = 'active'` → `CREATE INDEX ON tbl (user_id) WHERE status = 'active'`). Any query with `status = 'active'` can use this index.
- **Expression**: for computed search keys (`CREATE INDEX ON tbl (LOWER(email))`). Expression must match exactly in WHERE clause: `WHERE LOWER(email) = 'user@example.com'`.
- **GIN**: JSONB containment/existence, arrays (`@>`, `?`), full-text search (`@@`)
- **GiST**: ranges, geometry, exclusion constraints
- **BRIN**: very large, naturally ordered data (time-series)—minimal storage overhead. Effective when row order on disk correlates with indexed column (insertion order or after `CLUSTER`).

## Partitioning

> Most application tables never need partitioning. The material below applies to a table expected to pass ~100M
> rows.

- Use for very large tables (>100M rows) where queries consistently filter on partition key (often time/date).
- Alternate use: use for tables where data maintenance tasks dictates e.g. data pruned or bulk replaced periodically
- **RANGE**: common for time-series (`PARTITION BY RANGE (created_at)`). Create partitions: `CREATE TABLE logs_2024_01 PARTITION OF logs FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')`. **TimescaleDB** automates time-based or ID-based partitioning with retention policies and compression.
- **LIST**: for discrete values (`PARTITION BY LIST (region)`). Example: `FOR VALUES IN ('us-east', 'us-west')`.
- **HASH**: for even distribution when no natural key (`PARTITION BY HASH (user_id)`). Creates N partitions with modulus.
- **Constraint exclusion**: requires `CHECK` constraints on partitions for query planner to prune. Auto-created for declarative partitioning (PG10+).
- Prefer declarative partitioning or hypertables. Do NOT use table inheritance.
- **Limitations**: no global UNIQUE constraints—include partition key in PK/UNIQUE. FKs from partitioned tables not supported; use triggers.

## Special Considerations

### Update-Heavy Tables

- **Separate hot/cold columns**—put frequently updated columns in separate table to minimize bloat.
- **Use `fillfactor=90`** to leave space for HOT updates that avoid index maintenance.
- **Avoid updating indexed columns**—prevents beneficial HOT updates.
- **Partition by update patterns**—separate frequently updated rows in a different partition from stable data.

### Insert-Heavy Workloads

- **Minimize indexes**—only create what you query; every index slows inserts.
- **Use `COPY` or multi-row `INSERT`** instead of single-row inserts.
- **UNLOGGED tables** for rebuildable staging data—much faster writes.
- **Defer index creation** for bulk loads—>drop index, load data, recreate indexes.
- **Partition by time/hash** to distribute load. **TimescaleDB** automates partitioning and compression of insert-heavy data.
- **Use a natural key for primary key** such as a (timestamp, device_id) if enforcing global uniqueness is important many insert-heavy tables don't need a primary key at all.
- If you do need a surrogate key, use the project's key convention.

### Upsert-Friendly Design

- **Requires UNIQUE index** on conflict target columns—`ON CONFLICT (col1, col2)` needs exact matching unique index (partial indexes don't work).
- **Use `EXCLUDED.column`** to reference would-be-inserted values; only update columns that actually changed to reduce write overhead.
- **`DO NOTHING` faster** than `DO UPDATE` when no actual update needed.

### Safe Schema Evolution

- **Transactional DDL**: most DDL operations can run in transactions and be rolled back—`BEGIN; ALTER TABLE...; ROLLBACK;` for safe testing.
- **Concurrent index creation**: `CREATE INDEX CONCURRENTLY` avoids blocking writes but can't run in transactions. Migration tools that wrap each migration in a transaction (drizzle-kit's migrator among them) can't run it; on small tables plain `CREATE INDEX` is fine, on large live tables run the concurrent build outside the migrator.
- **Volatile defaults cause rewrites**: adding `NOT NULL` columns with volatile defaults (e.g., `now()`, `gen_random_uuid()`) rewrites entire table. Non-volatile defaults are fast.
- **Drop constraints before columns**: `ALTER TABLE DROP CONSTRAINT` then `DROP COLUMN` to avoid dependency issues.
- **Function signature changes**: `CREATE OR REPLACE` with different arguments creates overloads, not replacements. DROP old version if no overload desired.

## Generated Columns

- `... GENERATED ALWAYS AS (<expr>) STORED` for computed, indexable fields. PG18+ adds `VIRTUAL` columns (computed on read, not stored).

## Extensions

- Enable only the extensions you use, explicitly (e.g. `CREATE EXTENSION IF NOT EXISTS vector` before the
  migrations that need it); adding one is a project-level decision.
- **`pgcrypto`**: `crypt()` for password hashing.
- **`uuid-ossp`**: alternative UUID functions; prefer `pgcrypto` for new projects.
- **`pg_trgm`**: fuzzy text search with `%` operator, `similarity()` function. Index with GIN for `LIKE '%pattern%'` acceleration.
- **`citext`**: case-insensitive text type. Prefer expression indexes on `LOWER(col)` unless you need case-insensitive constraints.
- **`btree_gin`/`btree_gist`**: enable mixed-type indexes (e.g., GIN index on both JSONB and text columns).
- **`hstore`**: key-value pairs; mostly superseded by JSONB but useful for simple string mappings.
- **`timescaledb`**: essential for time-series—automated partitioning, retention, compression, continuous aggregates.
- **`postgis`**: comprehensive geospatial support beyond basic geometric types—essential for location-based applications.
- **`pgvector`**: vector similarity search for embeddings.
- **`pgaudit`**: audit logging for all database activity.

## JSONB Guidance

- Prefer `JSONB` over `JSON`. Many `jsonb` columns (traces, configs, payloads) are read whole by id and never
  filtered inside — they need **no** index.
- Add a GIN index only when a query filters inside the document: `CREATE INDEX ON tbl USING GIN (jsonb_col);` →
  accelerates:
  - **Containment** `jsonb_col @> '{"k":"v"}'`
  - **Key existence** `jsonb_col ? 'k'`, **any/all keys** `?\|`, `?&`
  - **Path containment** on nested docs
  - **Disjunction** `jsonb_col @> ANY(ARRAY['{"status":"active"}', '{"status":"pending"}'])`
- Heavy `@>` workloads: consider opclass `jsonb_path_ops` for smaller/faster containment-only indexes:
  - `CREATE INDEX ON tbl USING GIN (jsonb_col jsonb_path_ops);`
  - **Trade-off**: loses support for key existence (`?`, `?|`, `?&`) queries—only supports containment (`@>`)
- Equality/range on a specific scalar field: extract and index with B-tree (generated column or expression):
  - `ALTER TABLE tbl ADD COLUMN price INT GENERATED ALWAYS AS ((jsonb_col->>'price')::INT) STORED;`
  - `CREATE INDEX ON tbl (price);`
  - Prefer queries like `WHERE price BETWEEN 100 AND 500` (uses B-tree) over `WHERE (jsonb_col->>'price')::INT BETWEEN 100 AND 500` without index.
- Arrays inside JSONB: use GIN + `@>` for containment (e.g., tags). Consider `jsonb_path_ops` if only doing containment.
- Keep core relations in tables; use JSONB for optional/variable attributes.
- Use constraints to limit allowed JSONB values in a column e.g. `config JSONB NOT NULL CHECK(jsonb_typeof(config) = 'object')`

## Examples (uuid keys, application-level tenancy)

### A tenant table

```sql
CREATE TABLE review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pr_id uuid NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',          -- values enforced by the TypeScript enum (+ CHECK if critical)
  body text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_notes_workspace_idx ON review_notes (workspace_id);
CREATE INDEX review_notes_pr_idx ON review_notes (pr_id, created_at);  -- FK + the list order
CREATE INDEX review_notes_created_by_idx ON review_notes (created_by);
```

The same table in Drizzle (what you actually write):

```typescript
export const reviewNotes = pgTable(
  'review_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
    body: text('body').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('review_notes_workspace_idx').on(t.workspaceId),
    prIdx: index('review_notes_pr_idx').on(t.prId, t.createdAt),
    createdByIdx: index('review_notes_created_by_idx').on(t.createdBy),
  }),
);
```

### Per-entity child data with a composite key

```sql
CREATE TABLE file_rank (
  repo_id uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  rank double precision NOT NULL,
  PRIMARY KEY (repo_id, file_path)               -- also serves lookups by repo_id
);
CREATE INDEX file_rank_repo_rank_idx ON file_rank (repo_id, rank);
```

### JSONB read whole, never filtered

```sql
CREATE TABLE run_traces (
  run_id uuid PRIMARY KEY REFERENCES agent_runs(id) ON DELETE CASCADE,
  trace jsonb NOT NULL                           -- parsed with Zod on read; no GIN index needed
);
```

# Migrations

## The flow

```bash
# script names are examples — use the project's own
# 1. edit src/db/schema/*.ts
pnpm db:generate   # drizzle-kit generate → new SQL file + meta snapshot in src/db/migrations/
# 2. read the generated SQL; fix the schema (not the SQL) if it is wrong, delete the new files, regenerate
pnpm db:migrate    # e.g. tsx src/db/migrate.ts → drizzle-orm/postgres-js/migrator against DATABASE_URL
```

- Commit the schema change **and** the generated migration (SQL + `meta/`) in the same commit.
- **Never** `drizzle-kit push`: it changes the database without a migration file, so other checkouts, CI and the
  Testcontainers harness drift from your database.
- **Never edit a migration that has been applied** (anything already merged to a shared branch). Make a new schema change and
  generate a new migration instead.
- If migrations are not applied on boot, run the migrate script after pulling. Let the integration test harness run
  the same migrator on a fresh container.
- `drizzle-kit generate` needs no running database.

## Configuration

`drizzle.config.ts` (set up once — rarely changes):

```typescript
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  verbose: true,
  strict: true,
});
```

## Reviewing generated SQL

Check before committing:

- **Destructive steps** (`DROP COLUMN`, `DROP TABLE`, type changes) — is data loss intended? A rename that drizzle-kit
  saw as drop + add loses data; answer its interactive prompt as a rename.
- **New `NOT NULL` columns on existing tables** need a default, or a two-step change (add nullable → backfill →
  set not null). Volatile defaults (`now()`, `gen_random_uuid()`) rewrite the whole table.
- **Indexes** for every new foreign key (`postgresql-table-design`).
- **Extensions:** enable them explicitly — in the migrate script before the migrations run (e.g.
  `CREATE EXTENSION IF NOT EXISTS vector`, which also covers a Testcontainers harness) or in a custom migration.

## Custom SQL

When the change cannot be expressed in the schema (data backfill, a `CHECK` with an expression drizzle-kit can't
generate), create an empty migration with `pnpm exec drizzle-kit generate --custom --name <what>` and write the SQL
there. Keep it idempotent where possible (`IF NOT EXISTS`).

## Seed

A seed script (e.g. `src/db/seed.ts`) should upsert, so it can run repeatedly. If auth or defaults depend on seed
data, document that the seed is required. A schema change that the seed must reflect updates the seed in the same
commit.

## Avoid

`drizzle-kit push`, and `drizzle-kit pull` once the TypeScript schema is the source of truth. Prefer one way to apply
migrations (either `drizzle-kit migrate` or a migrate script using the migrator), used locally, in CI and in tests.
`drizzle-kit studio` is fine for local inspection.

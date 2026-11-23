---
name: configuration
description: Configuration and secrets in a Fastify API (one Zod-validated config module, a SecretsProvider)
metadata:
  tags: configuration, environment, env, secrets
---

# Application Configuration

## One config module, validated with Zod

One module (e.g. `src/platform/config.ts`) is the only place that reads non-secret environment variables:

- `dotenv/config` loads `.env`;
- an `EnvSchema` (Zod) validates and defaults every variable;
- `loadConfig(env = process.env)` returns a typed `AppConfig` with derived values (absolute paths,
  `webOrigin`, booleans for feature flags).

`buildApp({ config })` passes the config into the `Container`; code reads `container.config.*` (or receives a
value through its constructor). Tests build their own config: `loadConfig({ ...process.env, NODE_ENV: 'test' })`.
No second validation layer (`env-schema`, TypeBox) and no `app.decorate('config', …)`.

```typescript
// Adding a variable: extend EnvSchema and AppConfig in the same commit, and document it where the project
// documents its environment (README, .env.example).
const EnvSchema = z.object({
  // …
  IMPORT_MAX_FILES: z.coerce.number().int().positive().default(200),
});
```

- Empty strings from `.env` templates: preprocess `'' → undefined` before an enum (e.g. `LOG_LEVEL`).
- Booleans from env are strings: compare explicitly (`parsed.SEARCH_ENABLED !== 'false'`), never
  `z.coerce.boolean()`.
- `process.env` outside `config.ts` is a finding. Reasonable exceptions: the secrets adapter, a child process's
  environment and standalone CLI entrypoints (migrate, seed).

## Secrets are not configuration

API keys and tokens (e.g. `OPENAI_API_KEY`, `GITHUB_TOKEN`) are **not** in `EnvSchema`. They are read only through a
`SecretsProvider` port (`container.secrets`):

- The adapter decides where secrets come from (a secrets manager, a local file written with mode 0600, or
  `process.env` as a fallback).
- Secret-backed adapters (LLM providers, third-party APIs) are resolved lazily on use, so a missing key fails only
  the feature that needs it (`ConfigError`), and a rotated key is picked up.
- Never log a secret, put it in an error `details`, return it from an endpoint (status endpoints say *whether* a
  key is set, not its value), or commit `.env` / secret files.

## Runtime settings

Settings the user changes in the UI (e.g. model or provider choices) live in the database and are read
through the settings module, not through env. Add a new setting there when it should change without a restart.

## Feature flags

A flag is an env variable in `EnvSchema` turned into a typed boolean in `AppConfig` (e.g. `embeddingsEnabled`)
with a safe default. Consumers read the config value; a flag that is off makes the feature degrade (returns
degraded results), never crash.

## NODE_ENV

Read it only as `config.nodeEnv`. It already selects the default log level and disables the global rate limit under
`test`. For new behavior, prefer an explicit config value over branching on `nodeEnv`.

## Don't

- Per-environment config files or `import config from './config/production.json'`.
- Reading env at module top level in feature code (it bypasses validation and test overrides).
- Periodically refetched "dynamic config" services unless the app really needs them.

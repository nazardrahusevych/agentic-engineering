# Enforcement

A skill is advice; a failing check is enforcement. The dependency rule is checked with **dependency-cruiser**, which
reads TypeScript imports (including type-only imports) and fails on forbidden edges.

## Contents
- What is checked
- The config
- Running it
- Legacy code: the baseline
- Rollout
- What the tool cannot check
- Adapting the config

## What is checked

| Rule | Catches |
|---|---|
| `domain-is-pure` | `domain.ts` / `domain/` importing anything but domain code, module constants, shared contracts and the error classes (no Fastify, Drizzle, Zod, SDKs, other rings) |
| `no-fastify-outside-http-adapters` | Fastify imported by a module file other than `routes.ts`, `schemas.ts`, `http/` or the request-context helper |
| `no-drizzle-outside-repositories` | `drizzle-orm`, `src/db/schema` or `src/db/rows` imported by module files other than repositories, `*.repo.ts`, `mappers.ts`, `infrastructure/` |
| `no-sdk-outside-adapters` | Octokit, OpenAI, Anthropic, simple-git, ast-grep, ripgrep, tiktoken, dependency-cruiser imported outside `src/adapters/` and the container |
| `no-cross-module-internals` | a module importing another module's files other than its `index.ts` (`_shared` allowed) |
| `no-container-in-application` | services, domain, ports or repositories importing the DI container (only the plugin in `routes.ts` may) |
| `adapters-do-not-import-modules` | `src/adapters/*` depending on a feature module |
| `platform-does-not-import-modules` | `src/platform/*` (except `container.ts`) depending on a feature module |
| `no-circular` (warn) | import cycles |

When adopting it, verify it the same way: the config parses, every rule fires on a deliberately bad module, and
allowed imports (module constants, shared contracts, `platform/errors`, another module's `index.ts`) pass.

## The config

`.dependency-cruiser.cjs` in the backend package root (paths assume sources in `src/`, shared contracts copied into
`src/contracts/`; adjust to your layout):

```js
/**
 * Onion-architecture rules for src/ (see the onion-architecture skill).
 *
 * Rings inside a module: domain → application (service, ports) → adapters (routes, repository).
 * Composition roots that may import anything: src/app.ts, src/server.ts, src/platform/container.ts,
 * src/modules/index.ts.
 *
 * Run: pnpm arch:check. Legacy violations are grandfathered in .dependency-cruiser-known-violations.json
 * (pnpm arch:baseline regenerates it — only after removing violations, never to hide new ones).
 */

/** Files of a module that are adapters and may touch Fastify. */
const HTTP_ADAPTER = '(routes\\.ts|schemas\\.ts|/http/)';
/** Files of a module that are adapters and may touch Drizzle. */
const PERSISTENCE_ADAPTER = '(repository\\.ts|\\.repo\\.ts|/repository/|mappers\\.ts|/infrastructure/)';
/** Third-party SDKs and native tools that belong behind a port in src/adapters. */
const SDKS =
  'node_modules/(octokit|@octokit|openai|@anthropic-ai|simple-git|@ast-grep|@vscode/ripgrep|js-tiktoken|dependency-cruiser)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment:
        'Domain code (domain.ts or domain/) may import only other domain code, constants, shared ' +
        'contracts and platform/errors. No framework, ORM, Zod, SDK, Node I/O or other rings.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain(\\.ts$|/)' },
      to: {
        pathNot: [
          '^src/modules/[^/]+/domain(\\.ts$|/)',
          '^src/modules/[^/]+/constants\\.ts$',
          '^src/contracts/',
          '^src/platform/errors\\.ts$',
        ],
      },
    },
    {
      name: 'no-fastify-outside-http-adapters',
      comment:
        'Only routes.ts / schemas.ts / http/ of a module (and modules/_shared/context.ts) know Fastify. ' +
        'Services, domain and repositories receive plain values.',
      severity: 'error',
      from: {
        path: '^src/modules/',
        pathNot: [HTTP_ADAPTER, '^src/modules/_shared/context\\.ts$', '^src/modules/index\\.ts$'],
      },
      to: { path: 'node_modules/(fastify|@fastify/|fastify-[^/]+)/' },
    },
    {
      name: 'no-drizzle-outside-repositories',
      comment:
        'drizzle-orm, src/db/schema and src/db/rows are persistence details: only repositories, *.repo.ts, ' +
        'mappers.ts and infrastructure/ of a module may import them. Map rows before they leave.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: PERSISTENCE_ADAPTER },
      to: { path: ['node_modules/drizzle-orm/', '^src/db/'] },
    },
    {
      name: 'no-sdk-outside-adapters',
      comment:
        'External SDKs and native tools live in src/adapters behind a port from the shared contracts (anti-corruption layer).',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/adapters/', '^src/platform/container\\.ts$'] },
      to: { path: SDKS },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'A module imports another module only through its index.ts (public API) or gets its facade from the ' +
        'container. modules/_shared is the shared kernel.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/($1|_shared)/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'no-container-in-application',
      comment:
        'Services, ports and domain get explicit constructor dependencies; only composition roots ' +
        '(container.ts, the module plugin in routes.ts) read the Container.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: [HTTP_ADAPTER, '^src/modules/_shared/context\\.ts$'] },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'adapters-do-not-import-modules',
      comment: 'Driven adapters implement ports from the shared contracts; they never depend on feature modules.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'platform-does-not-import-modules',
      comment: 'Only the composition root (platform/container.ts) wires modules; other platform code stays module-free.',
      severity: 'error',
      from: { path: '^src/platform/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-circular',
      comment: 'Circular imports blur ring boundaries.',
      severity: 'warn',
      from: { path: '^src/' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/(contracts|db/migrations)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
```

Notes on the config:

- npm patterns are unanchored (`node_modules/drizzle-orm/`) so they match both a plain install and pnpm's
  `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/` real paths.
- `tsPreCompilationDeps: true` makes `import type` count — a service importing a row type is a violation.
- dependency-cruiser rejects "unsafe" (backtracking-prone) regexes; keep patterns simple (no nested optional groups).
- `extensionAlias` is not an accepted option; dependency-cruiser resolves `.js` specifiers to `.ts` sources on its
  own when `tsConfig` is set.

## Running it

Install `dependency-cruiser` as a dev dependency of the backend package, then add scripts to its `package.json`:

```json
{
  "arch:check": "depcruise src --config .dependency-cruiser.cjs --ignore-known --output-type err",
  "arch:baseline": "depcruise-baseline src --config .dependency-cruiser.cjs --output-to .dependency-cruiser-known-violations.json",
  "arch:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot | dot -T svg > dependency-graph.svg"
}
```

`arch:check` exits non-zero on any violation that is not in the baseline. `--output-type err` prints one line per
violation: rule name, from → to.

## Legacy code: the baseline

`depcruise-baseline` writes `.dependency-cruiser-known-violations.json` with every current violation. With
`--ignore-known`, those are reported as "known" and don't fail the run; any **new** violation does.

A typical first baseline on a legacy codebase holds entries such as:

- `no-drizzle-outside-repositories` — Drizzle queries in routes; schema/row imports in services or helpers;
- `no-container-in-application` — services that take the whole `Container`;
- `no-cross-module-internals` — a service importing another module's `constants.ts` instead of its `index.ts`;
- `adapters-do-not-import-modules` — an adapter importing a module's constants;
- cycles through `platform/container.ts` and between a module's helpers and its repository.

Rules for the baseline:

- Regenerate it only after **removing** violations (the file must only shrink). Never regenerate to make a new
  violation pass.
- A PR that refactors a legacy module removes that module's entries in the same PR.
- Generate it from the main checkout: the file stores resolved paths, and a worktree with linked `node_modules`
  produces different ones.

## Rollout

1. Add the config, the scripts and the baseline; run `arch:check` locally — it must pass.
2. Add `arch:check` to the backend CI job next to typecheck and unit tests.
3. Shrink the baseline module by module (Workflow C in SKILL.md).
4. When the baseline is empty, drop `--ignore-known`.

## What the tool cannot check

Review these by hand (SKILL.md, Workflow B):

- `process.env` outside config, `Date.now()` / random in domain code (not imports);
- unscoped tenant queries, writes in GET handlers, missing transactions, missing response schemas;
- business rules in routes or repositories (the imports may be fine while the logic is in the wrong ring);
- `export *` in a module's `index.ts` exposing its service or repository — the rule allows any import of `index.ts`,
  so the public API must be kept narrow by review.

## Adapting the config

- New SDK → add its package name to `SDKS`.
- A module moves to ring folders → the folder names (`domain/`, `http/`, `infrastructure/`) are already covered.
- Another package (e.g. a worker) → copy the config and change the `^src/` roots.
- Alternatives if the project uses ESLint: `eslint-plugin-boundaries` element types; for
  architecture tests inside Vitest: ArchUnitTS or ts-arch. Keep one source of truth.

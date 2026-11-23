# Enforcing the architecture with tooling

## Contents
- Why lint instead of review
- Packages
- Reference config (ESLint flat config)
- What each part catches
- Adapting the config
- Rolling it out
- Other tools

## Why lint instead of review

Folder rules that live only in documents drift within weeks. Import direction, cross-feature imports, `export *` and
naming are mechanical checks: put them in the linter and keep reviews for judgment calls (is this really a feature?
does this rule belong in `model/`?). Next.js adds a build-time guard on top: a module with `import "server-only"`
fails the build when a client module imports it.

## Packages

Install with the project's package manager:

```bash
npm install -D eslint typescript-eslint eslint-plugin-import eslint-import-resolver-typescript eslint-plugin-check-file
```

The config below was verified with eslint 9.39, typescript-eslint 8.71, eslint-plugin-import 2.32,
eslint-import-resolver-typescript 3.10 and eslint-plugin-check-file 3.3 against a fixture with planted violations:
it reported every violation and no false positives. Re-run it against your tree before switching rules to `error`.

## Reference config (ESLint flat config)

Assumes `src/` with the layout from `folder-structure.md` and an `@/*` → `./src/*` path alias in `tsconfig.json`.
Merge it with the project's existing config (for example `eslint-config-next`) rather than replacing it.

```js
// eslint.config.mjs
import fs from "node:fs";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import checkFile from "eslint-plugin-check-file";

// One zone per feature, generated so new features are covered automatically.
const features = fs.existsSync("src/features")
  ? fs.readdirSync("src/features", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const SHARED = ["./src/components", "./src/hooks", "./src/lib", "./src/utils", "./src/types", "./src/config"];

export default tseslint.config(
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { import: importPlugin, "check-file": checkFile },
    settings: { "import/resolver": { typescript: { project: "./tsconfig.json" } } },
    rules: {
      "import/no-restricted-paths": ["error", { zones: [
        ...features.map((name) => ({
          target: `./src/features/${name}`,
          from: "./src/features",
          except: [`./${name}`],
          message: "Features must not import other features: compose them in app/ or move the shared piece down.",
        })),
        { target: "./src/features", from: "./src/app", message: "Features must not import routes." },
        { target: SHARED, from: ["./src/features", "./src/app"], message: "Shared code must not depend on features or routes." },
        {
          target: [...SHARED, ...features.flatMap((name) => [`./src/features/${name}/components`, `./src/features/${name}/hooks`])],
          from: "./src/server",
          message: "server/ is imported only by Server Components, 'use server' files and Route Handlers.",
        },
      ] }],
      "import/no-cycle": "error",
      "no-restricted-syntax": ["error", {
        selector: "ExportAllDeclaration",
        message: "Use explicit named re-exports instead of export *.",
      }],
      "check-file/filename-naming-convention": ["error", {
        "src/**/!(page|layout|loading|error|not-found|template|default|global-error|providers).tsx": "PASCAL_CASE",
        "src/**/*.ts": "KEBAB_CASE",
      }, { ignoreMiddleExtensions: true }],
    },
  },
  {
    // Component files are PascalCase and named like their folder: RunStatus/RunStatus.tsx, RunStatus/RunStatus.test.tsx
    files: ["src/**/{components,_components}/*/*.tsx"],
    rules: {
      "check-file/filename-naming-convention": ["error", {
        "src/**/{components,_components}/*/*.tsx": "PASCAL_CASE",
        "src/**/{components,_components}/*/!(index).tsx": "<2>",
      }, { ignoreMiddleExtensions: true }],
    },
  },
  {
    // Route segment folders: kebab-case, [camelCase] params, (groups), @slots, _private
    files: ["src/app/**/{page,layout,loading,error,not-found,template,default,global-error,route}.{ts,tsx}"],
    rules: { "check-file/folder-naming-convention": ["error", { "src/app/**/": "NEXT_JS_APP_ROUTER_CASE" }] },
  },
  {
    // Feature and shared folders (component folders excluded): kebab-case
    files: [
      "src/features/*/*.{ts,tsx}",
      "src/features/*/{api,hooks,model}/**/*.{ts,tsx}",
      "src/{hooks,lib,utils,types,config,server}/**/*.{ts,tsx}",
    ],
    rules: { "check-file/folder-naming-convention": ["error", { "src/**/": "KEBAB_CASE" }] },
  },
);
```

## What each part catches

| Rule | Catches |
|---|---|
| Per-feature zones | `features/reviews/**` importing anything from `features/<other>/**` |
| `features` ← `app` zone | A feature importing a route's code |
| Shared zone | `components/`, `hooks/`, `lib/`, `utils/`, `types/`, `config/` importing features or routes |
| `server/` zone | Shared code, feature components or feature hooks importing server-only modules (`api/` and route files may) |
| `import/no-cycle` | Circular imports, usually created by importing a folder's own `index.ts` |
| `no-restricted-syntax` on `ExportAllDeclaration` | `export * from "./x"` barrels |
| Filename rules | Non-PascalCase component files, component files not named like their folder, non-kebab `.ts` modules |
| Folder rules | Route folders outside Next.js App Router naming; non-kebab feature and shared folders |

## Adapting the config

- **Different folder names** (`shared/` instead of `components/`, `entities/` layer): edit `SHARED` and the zones; for
  an `entities/` layer add a zone that forbids `entities` → `features`.
- **Existing naming conventions** (e.g. camelCase hook files `useX.ts`): change or drop the `check-file` blocks;
  never rename a whole codebase just to satisfy a default.
- **Non-component `.tsx` files** that are not pages (`providers.tsx`, `atoms.tsx`): add their names to the
  exclusion list in the first filename pattern.
- **Windows:** keep zone `target`/`from` values as plain paths. eslint-plugin-import resolves them to absolute paths
  and matches globs with minimatch, so glob targets such as `./src/features/*/components` silently match nothing on
  Windows; that is why the config generates explicit per-feature paths.
- **Monorepo packages:** run the config per package (each package has its own `src/`).

## Rolling it out

1. Add the config with `"warn"` instead of `"error"` and run `eslint src` to list current violations.
2. Fix violations domain by domain (see Workflow C in `SKILL.md`), or add a temporary `ignores` entry for legacy
   folders that are scheduled to move.
3. Switch rules to `"error"` and run lint in CI and in the pre-commit hook.

## Other tools

- **eslint-plugin-boundaries** — an alternative to import zones: tag folders as element types (`app`, `feature`,
  `shared`) by glob and declare allowed dependencies between types; can also allow only a feature's entry file.
  <https://github.com/javierbrea/eslint-plugin-boundaries>
- **Steiger** — linter for projects that adopt full Feature-Sliced Design (layer imports, public API, sidestepping).
  <https://github.com/feature-sliced/steiger>
- **dependency-cruiser** — validates and visualizes the module graph in CI with its own rule file.
  <https://github.com/sverweij/dependency-cruiser>
- **Knip** — finds unused files, exports and dependencies; useful after restructuring.
  <https://knip.dev/>

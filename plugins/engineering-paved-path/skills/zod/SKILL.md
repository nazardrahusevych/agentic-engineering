---
name: zod
description: Zod 3 schema validation best practices for TypeScript backends, frontends and shared contract packages — writing z.object schemas and string validations, safeParse at trust boundaries (LLM output, JSON columns, job payloads, external APIs), z.infer, error handling, object modes, composition, refinements and performance. Use when defining or reviewing a Zod schema, a shared contract, or code that parses untrusted data. Route validation mechanics are in fastify-best-practices; where schemas live is in onion-architecture and frontend-architecture.
---

# Zod Best Practices

Schema validation guide for Zod. Contains 42 rules across 8 categories, prioritized by impact.

## Assumed stack

Versions are examples — adapt to your project.

- **Zod 3.x.** Zod 4 APIs (`z.email()`, `{ error: … }` params, `z.treeifyError`, `@zod/mini`) are not available in
  Zod 3; check the installed version before using them.
- **Several Zod instances:** if two packages resolve `zod` from their own `node_modules`, never rely on
  `err instanceof ZodError` across that line — match by shape (`err.name === 'ZodError'` and `issues`).
- **Contracts** shared by backend and frontend live in a shared contracts package. If that package is copied into
  several places, a contract change edits **every** copy in one commit.
- **Routes** are validated by the framework from the route `schema` (e.g. `fastify-type-provider-zod`: params,
  querystring, body, response) — no manual `.parse(req.body)` in handlers. A global error handler turns failures
  into a 4xx.
- **`safeParse` is for trust boundaries without a route schema:** LLM output, `jsonb` columns read back from
  Postgres, job payloads, third-party API responses, local config and secret files, environment variables.
- **Stored shapes evolve:** fields added to anything persisted as JSON are `.nullish()`; readers render a fallback.
- **Object mode:** default strip. `.strict()` only when rejecting unknown keys is a requirement (it breaks forward
  compatibility of stored JSON and LLM output).
- **Client forms:** user-facing messages come from the app's i18n layer (if any), not from Zod error strings.

## When to Apply

Reference these guidelines when:
- Writing or changing a Zod schema or a shared contract
- Parsing data that crosses a trust boundary
- Inferring types with `z.infer` instead of hand-written interfaces
- Handling validation errors
- Composing object schemas, refinements and transforms
- Reviewing Zod code

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Schema Definition | CRITICAL | `schema-` |
| 2 | Parsing & Validation | CRITICAL | `parse-` |
| 3 | Type Inference | HIGH | `type-` |
| 4 | Error Handling | HIGH | `error-` |
| 5 | Object Schemas | MEDIUM-HIGH | `object-` |
| 6 | Schema Composition | MEDIUM | `compose-` |
| 7 | Refinements & Transforms | MEDIUM | `refine-` |
| 8 | Performance | LOW-MEDIUM | `perf-` |

## Quick Reference

### 1. Schema Definition (CRITICAL)

- `schema-use-primitives-correctly` - Use correct primitive schemas for each type
- `schema-use-unknown-not-any` - Use z.unknown() instead of z.any() for type safety
- `schema-avoid-optional-abuse` - Avoid overusing optional fields
- `schema-string-validations` - Apply string validations at schema definition
- `schema-use-enums` - Use enums for fixed string values
- `schema-coercion-for-form-data` - Use coercion for query and form data (never `z.coerce.boolean()` for `"false"`)

### 2. Parsing & Validation (CRITICAL)

- `parse-use-safeparse` - Use safeParse() at trust boundaries (routes use the type provider instead)
- `parse-async-for-async-refinements` - Use parseAsync for async refinements
- `parse-handle-all-issues` - Handle all validation issues not just first
- `parse-validate-early` - Validate at system boundaries
- `parse-avoid-double-validation` - Avoid validating same data twice
- `parse-never-trust-json` - Never trust JSON.parse output (LLM text, jsonb, files)

### 3. Type Inference (HIGH)

- `type-use-z-infer` - Use z.infer instead of manual types
- `type-input-vs-output` - Distinguish z.input from z.infer for transforms
- `type-export-schemas-and-types` - Export both schemas and inferred types
- `type-branded-types` - Use branded types for domain safety
- `type-enable-strict-mode` - Enable TypeScript strict mode

### 4. Error Handling (HIGH)

- `error-custom-messages` - Provide custom error messages
- `error-use-flatten` - Use flatten() for form error display
- `error-path-for-nested` - Use issue.path for nested error location
- `error-i18n` - Internationalized messages (prefer the app's i18n keys in the client)
- `error-avoid-throwing-in-refine` - Return false instead of throwing in refine

### 5. Object Schemas (MEDIUM-HIGH)

- `object-strict-vs-strip` - Choose strict() vs strip() for unknown keys (recommended default: strip)
- `object-partial-for-updates` - Use partial() for update schemas
- `object-pick-omit` - Use pick() and omit() for schema variants
- `object-extend-for-composition` - Use extend() for adding fields
- `object-optional-vs-nullable` - Distinguish optional() from nullable()
- `object-discriminated-unions` - Use discriminated unions for type narrowing

### 6. Schema Composition (MEDIUM)

- `compose-shared-schemas` - Extract shared schemas into reusable modules
- `compose-intersection` - Use intersection() for type combinations
- `compose-lazy-recursive` - Use z.lazy() for recursive schemas
- `compose-preprocess` - Use preprocess() for data normalization
- `compose-pipe` - Use pipe() for multi-stage validation

### 7. Refinements & Transforms (MEDIUM)

- `refine-vs-superrefine` - Choose refine() vs superRefine() correctly
- `refine-transform-coerce` - Distinguish transform() from refine() and coerce()
- `refine-add-path` - Add path to refinement errors
- `refine-defaults` - Use default() for optional fields with defaults
- `refine-catch` - Use catch() for fault-tolerant parsing

### 8. Performance (LOW-MEDIUM)

- `perf-cache-schemas` - Cache schema instances
- `perf-avoid-dynamic-creation` - Avoid dynamic schema creation in hot paths
- `perf-lazy-loading` - Lazy load large schemas
- `perf-arrays` - Optimize large array validation

## How to Use

Read individual reference files for detailed explanations and code examples:

- [Section definitions](references/_sections.md) - Category structure and impact levels
- [Rule template](assets/templates/_template.md) - Template for adding new rules
- Individual rules: `references/{prefix}-{slug}.md`

## Rule Index

All rules with one-line impact notes: [RULES.md](RULES.md)

## Related Skills

- `fastify-best-practices` — how route schemas are wired (type provider, error envelope)
- `onion-architecture` — where schemas live and where untrusted data is parsed (`references/zod-boundaries.md`)
- `frontend-architecture` — where client-side schemas and contract re-exports live
- `typescript-expert` — type-level questions around inferred types

## Sources

- [Zod 3 documentation](https://v3.zod.dev/) — the API for the version in use
- [Zod GitHub Repository](https://github.com/colinhacks/zod)
- [Total TypeScript Zod Tutorial](https://www.totaltypescript.com/tutorials/zod)

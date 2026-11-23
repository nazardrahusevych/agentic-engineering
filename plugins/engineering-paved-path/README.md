# engineering-paved-path

The shared engineering skills of this marketplace: one place for the architecture, language, library and security
guidance that agents and people apply while writing and reviewing code. Other plugins depend on it instead of copying
skills — `architecture-review` and `sdd-engineering` install it automatically.

```
/plugin marketplace add nazardrahusevych/agentic-engineering
/plugin install engineering-paved-path@agentic-engineering
```

## Skills

| Skill | Area | Use it for |
|---|---|---|
| `onion-architecture` | backend architecture | where backend code lives: domain, application (use cases, ports) and adapter rings; allowed imports; transactions; wiring and composition roots |
| `frontend-architecture` | frontend architecture | route, feature and shared layers in React / Next.js apps; import direction; data layer; server/client boundaries |
| `security` | full stack | secure-coding rules mapped to OWASP Top 10 and LLM/agentic risks: access control and tenancy, injection, untrusted content and prompt injection, secrets, child processes, rendering |
| `typescript-expert` | language | type-level programming, strict-mode errors, inferred types, path aliases, type-check performance |
| `zod` | validation | schemas, parsing at trust boundaries, error handling, type inference |
| `react-best-practices` | frontend | components, state, hooks and effects, memoization, accessibility, data fetching |
| `react-testing-library` | frontend tests | React Testing Library + Vitest: queries, user events, async patterns, mocking |
| `next-best-practices` | frontend | Next.js App Router: RSC boundaries, data patterns, metadata, route handlers, hydration, bundling |
| `fastify-best-practices` | backend | Fastify plugins, routes with schemas, error handling, hooks, logging, configuration, testing with `inject()` |
| `drizzle-orm-patterns` | data access | Drizzle schemas, queries, joins, transactions, relations, migrations |
| `postgresql-table-design` | data | PostgreSQL keys, types, constraints, indexes, JSONB, pgvector, safe schema evolution |
| `mermaid-diagram` | docs | flowcharts, sequence, class, ER and state diagrams in markdown |
| `engineering-insights` | team memory | recording confirmed, non-obvious lessons in the module's `INSIGHTS.md` |

Each skill is loaded on demand when Claude decides it is relevant, or explicitly by name. From another plugin, refer to
them as `engineering-paved-path:<skill>` — for example in an agent's `skills:` list:

```yaml
skills:
  - engineering-paved-path:onion-architecture
  - engineering-paved-path:security
```

## Adapting to your project

The skills are project-neutral. Stack versions they mention are examples. Your project's `CLAUDE.md` / `AGENTS.md`
wins where it deliberately differs — for example a different module layout or a legacy pattern you keep. The two
architecture skills describe a target: code that does not follow them yet is legacy, not a counter-example.

`engineering-insights` expects an `INSIGHTS.md` per module (created on first use); skip it if your team keeps lessons
elsewhere.

## Used by

| Plugin | Uses |
|---|---|
| `architecture-review` | `onion-architecture`, `frontend-architecture`, `typescript-expert` (preloaded by the reviewer) |
| `sdd-engineering` | placement skills in the planner; `security` and `typescript-expert` preloaded by the implementer, which loads the rest per task; `mermaid-diagram` and `security` in the spec-creator; `engineering-insights` in `run-plan` |

Versions: [CHANGELOG.md](CHANGELOG.md).

# onion-architecture

**Version:** 1.1.0 · [Version history](#version-history)

A skill for agents (Claude Code, Codex) about **onion architecture for backend feature modules** built on Fastify,
Drizzle, Zod and Postgres: how a module splits into rings, which file may depend on which library or other module,
where each kind of backend code lives, how dependencies are wired, how each ring is tested and how the rules are
enforced.

This README is for humans. Agents load `SKILL.md` (and, on demand, one file from `references/`); they never read this
file, so it can be as long as it needs to be.

## Focus

The skill answers "**which ring does this code belong to, and what may it import?**" — not "how do I write a Fastify
route" or "how do I write a Drizzle query". It is the single source for backend structural decisions, so the library
skills don't have to repeat them and don't contradict them.

Onion, hexagonal (ports and adapters) and clean architecture share one rule — dependencies point inward, the core
defines interfaces and the edges implement them. The skill uses the onion vocabulary (domain → application →
adapters) and borrows "ports", "driving/driven adapters" and "composition root" from the other two.

## What it covers

- The rings of one module (domain, application with ports, driving and driven adapters) and the composition root.
- Scaling the onion to the module: onion-lite for CRUD, full onion where real rules exist, ring folders for big
  modules.
- A placement table for every kind of backend code and an import matrix per ring.
- Fastify as the driving adapter: encapsulated module plugins, thin routes, request/response schemas, request
  context and tenancy, the global error handler, job handlers, SSE and CLI entrypoints.
- Drizzle as the driven adapter: repository shape, row → model mapping, tenant scoping, when to add a repository
  port, transactions owned by the use case, read queries, parsing stored JSON.
- Zod at the boundaries: parse, don't validate; where each schema lives; LLM output, webhooks, job payloads;
  branded identifiers; two Zod instances.
- Ports, SDK adapters as anti-corruption layers, explicit constructor dependencies instead of a service locator,
  facades between modules, pure engines as the innermost core.
- Testing per ring (managed vs unmanaged dependencies).
- Enforcement: a tested dependency-cruiser config, a baseline for legacy code and a CI rollout.
- Three workflows with checklists: adding a module or use case, reviewing a diff, moving a legacy module onto the
  onion.

## What it does not cover

| Topic | Where it lives |
|---|---|
| Fastify plugins, hooks, serialization, logging, auth mechanics | `fastify-best-practices` |
| Drizzle schema, query, relation and migration syntax | `drizzle-orm-patterns` |
| Tables, types, indexes, constraints | `postgresql-table-design` |
| Writing schemas | `zod` |
| Authorization and data exposure rules | `security` |
| Type-level design, tsconfig | `typescript-expert` |
| Frontend structure | `frontend-architecture` |

## Use cases

Prompts that should trigger the skill:

- **New module or endpoint:** "Add a `notes` module: CRUD for notes on a PR plus a 'resolve' action that also posts
  a GitHub comment — which files, what goes where?"
- **Placing one piece:** "Where should the query that lists runs per PR live?", "Should the service import the row
  type?", "Where do I parse the LLM's JSON?"
- **Review:** "Review this server diff for layering problems."
- **Refactor:** "`pulls/routes.ts` queries Drizzle directly and writes in a GET handler — plan the refactor."
- **Transactions:** "This use case deletes and re-inserts files and commits; make it atomic without leaking Drizzle
  into the service."
- **Tooling:** "Make CI fail when a service imports Drizzle."

## How it is organized

```
onion-architecture/
├── SKILL.md                     # loaded when the skill triggers: model, placement table, import matrix, workflows
├── README.md                    # this file (humans only)
├── references/                  # loaded one at a time, only when the task needs it
│   ├── rings-and-rules.md       # each ring, layouts, public API, shared kernel, errors, model types, worked example
│   ├── fastify-adapter.md       # module plugins, composition in the plugin, thin routes, schemas, errors, jobs/SSE
│   ├── persistence-drizzle.md   # repositories, mapping, tenant scoping, ports, transactions, read queries, JSON
│   ├── zod-boundaries.md        # parsing points, schema homes, external and stored data, config, brands
│   ├── ports-and-di.md          # port ownership, SDK adapters, composition root, explicit dependencies, facades
│   ├── testing.md               # tests per ring, what to fake
│   └── enforcement.md           # tested dependency-cruiser config, baseline, rollout, limits
```

Design follows Anthropic's skill-authoring guidance: a short `SKILL.md`, progressive disclosure through references one
level deep, a table of contents in each reference, a third-person description that says what the skill does and when
to use it, and no time-sensitive statements in agent-facing files.

**Project conventions win.** A project's `AGENTS.md` (or `CLAUDE.md`) overrides the defaults; the skill never asks an
agent to migrate code it wasn't asked to touch.

## Related skills

| Skill | Scope | Difference from this skill |
|---|---|---|
| `fastify-best-practices` | How Fastify features work | This skill decides what a route file may do and where Fastify may be imported |
| `drizzle-orm-patterns` | How to write Drizzle code | This skill confines Drizzle to repositories and decides who owns transactions |
| `postgresql-table-design` | Table design | This skill only says the schema is an adapter detail |
| `zod` | Schema authoring | This skill says where schemas live and what inner rings receive |
| `security` | OWASP rules, auth | This skill places tenancy and authorization checks in the right ring |
| `frontend-architecture` | Next.js client structure | Same question for the client; the two never overlap |
| `engineering-insights` | Project-specific lessons | Project decisions go to `AGENTS.md` / `INSIGHTS.md`, not into this generic skill |

## Default decisions and why

Sources disagree on several points. These are the defaults chosen for version 1.0.0; each can be overridden by a
project convention.

| Topic | Default | Alternatives considered | Main sources |
|---|---|---|---|
| How strict | Scale per module: onion-lite for CRUD, full onion (domain + ports) where real rules exist | Full onion everywhere (ceremony); no layers / vertical slices only (rules leak into handlers) | Palermo part 1, domain-driven-hexagon "smaller APIs", Bogard, Stemmler |
| Module layout | Flat files per ring (`domain.ts`, `ports.ts`, `service.ts`, `repository.ts`, `routes.ts`); ring folders past ~8–10 files | Ring folders always; per-use-case slices (`commands/`, `queries/`) | domain-driven-hexagon, fastify-boilerplate, Simon Brown via Jovanović |
| Model types | Contract DTO is the model in CRUD modules; domain types only where rules exist; Drizzle rows never leave the repository | Separate domain + persistence models everywhere; rows used as the model | Uncle Bob, Stemmler (repository/DTO/mapper), domain-driven-hexagon |
| Dependencies | Explicit constructor dependencies; only the composition root reads the container; hand wiring, no DI library | Service locator (container passed in); Awilix / `@fastify/awilix` | Seemann (composition root, service locator), Fowler (injection), Microsoft Clean Architecture |
| Repository ports | Only where a fake, a second implementation or another module needs it; otherwise the concrete class + real Postgres in tests | An interface for every repository | Khorikov (when to mock), Cockburn, domain-driven-hexagon |
| Errors | Shared `AppError` family as the error kernel; the global handler maps to HTTP; no HTTP in services | Domain errors without status + separate mapping table; `Result` everywhere | domain-driven-hexagon, Node.js best practices 2.3–2.4, Stemmler (Result) |
| Transactions | Use case owns the boundary through a `TransactionRunner` port; repositories take an executor; side effects after commit | Repository-level transactions; Drizzle `tx` typed into services | Fowler (Unit of Work), Sentry atomic repositories |
| Zod | Only at the edges (routes, adapters, mappers, config); the domain doesn't import it | Zod-based value objects in the domain | Parse, don't validate; domain-driven-hexagon; Fastify validation docs |
| Enforcement | dependency-cruiser with a shrinking baseline | ESLint boundaries (needs ESLint); ArchUnitTS / ts-arch tests | dependency-cruiser docs, domain-driven-hexagon, fastify-boilerplate, Jovanović |

## Sources

All links were collected on 2026-10-16. "Not re-read" marks pages whose host reset the connection during research:
their summaries come from prior knowledge and should be re-read before a rule changes because of them.

### Onion architecture and its siblings

- [Jeffrey Palermo — The Onion Architecture: part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — origin of the term; all coupling toward the center; interfaces in the core, implementations at the edge; not for small sites.
- [Jeffrey Palermo — part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) and [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) — sample implementation of the layers.
- [Jeffrey Palermo — Part 4: After Four Years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) — the four tenets; core builds and runs without infrastructure; DDD and IoC containers optional.
- [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) — ports as purposeful conversations, adapters per technology; driving vs driven; tests and in-memory fakes as adapters.
- [Robert C. Martin — The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) — the dependency rule; only simple data crosses boundaries; dependency inversion for outward control flow.
- [Herberto Graça — DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) — core rings plus ports; package by component; no cross-component code references; read others' data, write only your own.
- [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) and [Layered Architecture](https://herbertograca.com/2017/08/03/layered-architecture/) — history and comparison of the styles.
- [Microsoft Learn — Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) — Application Core / Infrastructure / UI contents; composition root; unit tests for the core, integration tests for infrastructure.
- [Martin Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) — layer at small granularity; domain modules at the top level, layered inside.
- [Milan Jovanović — Clean Architecture: The Missing Chapter](https://milanjovanovic.tech/blog/clean-architecture-the-missing-chapter) — the circles are not a folder layout; package by component; architecture tests; pragmatism over purism.
- [Simon Brown — "The Missing Chapter", *Clean Architecture* ch. 34 (O'Reilly, paywalled)](https://www.oreilly.com/library/view/clean-architecture-a/9780134494272/ch34.xhtml) — package by layer / feature / ports and adapters / component.
- [ardalis/CleanArchitecture](https://github.com/ardalis/CleanArchitecture) and [eShopOnWeb](https://github.com/dotnet-architecture/eShopOnWeb) — reference solutions for the Microsoft guide.

### Building blocks (PoEAA, DDD)

- [Martin Fowler — Repository](https://martinfowler.com/eaaCatalog/repository.html) · [Data Mapper](https://martinfowler.com/eaaCatalog/dataMapper.html) · [Separated Interface](https://martinfowler.com/eaaCatalog/separatedInterface.html) — collection-like access to domain objects; mapping that keeps objects and DB independent; interface and implementation in different packages.
- [Martin Fowler — Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) — the application boundary that coordinates use cases and transactions.
- [Martin Fowler — Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html) — one business transaction across several writes.
- [Martin Fowler — Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html) · [Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html) · [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html) — when simple procedures are enough and when rules deserve a model.
- [Martin Fowler — Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) and [Eric Evans — DDD Reference](https://www.domainlanguage.com/ddd/reference/) — module boundaries by model.
- [Microsoft — Anti-corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer) — translate external semantics at the boundary; no business rules in the translation layer.
- [DevIQ — Repository Pattern](https://deviq.com/repository-pattern/) — repository as the abstraction over data access.

### Dependency injection and the composition root

- [Mark Seemann — Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) (not re-read) — compose the object graph in one place near the entry point.
- [Mark Seemann — Pure DI](https://blog.ploeh.dk/2014/06/10/pure-di/) (not re-read) — hand-written composition without a container.
- [Mark Seemann — Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/) (not re-read) — hidden dependencies.
- [Martin Fowler — Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html) — locator vs injection; separate configuration from use.
- [`@fastify/awilix`](https://github.com/fastify/fastify-awilix) and [Awilix](https://github.com/jeffijoe/awilix) — container option with request scopes, if hand wiring ever outgrows itself.

### Pure core and parsing

- [Mark Seemann — Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/) and [Impureim sandwich](https://blog.ploeh.dk/2020/03/02/impureim-sandwich/) (not re-read) — pure decisions between impure reads and writes.
- [Gary Bernhardt — Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) and [Boundaries](https://www.destroyallsoftware.com/talks/boundaries) — values in the core, I/O in the shell.
- [Vladimir Khorikov — Domain model purity vs. completeness](https://enterprisecraftsmanship.com/posts/domain-model-purity-completeness/) — I/O belongs in application services; prefer purity over completeness.
- [Vladimir Khorikov — Domain model isolation](https://enterprisecraftsmanship.com/posts/domain-model-isolation/) — keeping the domain free of out-of-process dependencies.
- [Alexis King — Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) — parse once at the boundary into precise types; no shotgun parsing.

### Node.js and TypeScript implementations

- [Sairyss — domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) — modules, use-case services, domain errors, mappers, dependency-cruiser rules, recommendations for smaller APIs.
- [Sairyss — backend-best-practices](https://github.com/Sairyss/backend-best-practices) — companion list of backend practices.
- [Yoni Goldberg — Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) — structure by components (1.1), three tiers per component (1.2), validated config (1.4), central error handling (2.3–2.4), component tests (4.1).
- [Practica.js](https://github.com/practicajs/practica) and [Coding with Practica](https://practica.dev/the-basics/coding-with-practica/) (site not re-read) — Fastify starter with 3-tier components and no DI container.
- [Khalil Stemmler — Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) — policy vs detail; interfaces on the policy side, wired at the entry point.
- [Khalil Stemmler — Organizing App Logic with the Clean Architecture](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/) — domain, application, infrastructure; use the full layering only with real rules.
- [Khalil Stemmler — DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) — repositories return domain objects; `toDomain` / `toPersistence` / `toDTO`.
- [Khalil Stemmler — Flexible Error Handling w/ the Result Class](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/handling-errors-result-class/) and [neverthrow](https://github.com/supermacro/neverthrow) — typed results for expected failures.
- [stemmlerjs/white-label](https://github.com/stemmlerjs/white-label) — reference TypeScript DDD app.
- [Remo H. Jansen — Onion Architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) — rings with repository interfaces in the domain-services ring.
- [Remo H. Jansen — fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) — layer import checks for TypeScript.
- [Lazar Nikolov (Sentry) — Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — transactions across repositories with Drizzle behind an application-layer port.
- [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) — Fastify 5 + Clean Architecture + CQRS; SQL only in repositories; dependency-cruiser in CI; `AGENTS.md` for AI assistants.
- [revell29/fastify-clean-architecture](https://github.com/revell29/fastify-clean-architecture) — community Fastify template with domain/application/infrastructure folders (lower authority).
- [Santiago Quinteros — Bulletproof Node.js project architecture](https://www.softwareontheroad.com/ideal-nodejs-project-structure/) — three-layer Node.js structure with services and DI.

### Fastify

- [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) and [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) — every `register` is an encapsulated context; `fastify-plugin` only for what must be shared.
- [Testing guide](https://fastify.dev/docs/latest/Guides/Testing/) — app factory vs listen; `inject()`; plugin tests in isolation.
- [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) — response schemas prevent leaks and speed up serialization; no DB access during validation.
- [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) · [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) · [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) · [Errors](https://fastify.dev/docs/latest/Reference/Errors/) — reference pages behind the adapter rules.
- [`fastify-plugin`](https://github.com/fastify/fastify-plugin) · [`@fastify/autoload`](https://github.com/fastify/fastify-autoload) · [`fastify-cli`](https://github.com/fastify/fastify-cli) — tooling referenced by the plugin rules.
- [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod) — validator/serializer compilers, typed replies from response schemas, error helpers; version ↔ Zod compatibility.
- [Matteo Collina — Building a modular monolith with Fastify](https://gitnation.com/contents/building-a-modular-monolith-with-fastify) — structure by domains, plugins as module boundaries.

### Drizzle

- [Transactions](https://orm.drizzle.team/docs/transactions) (not re-read) — `db.transaction`, `tx.rollback()`, savepoints, Postgres isolation options.
- [Goodies / type helpers](https://orm.drizzle.team/docs/goodies) (not re-read) — `$inferSelect` / `$inferInsert`.
- [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) and [Relational queries](https://orm.drizzle.team/docs/rqb) (not re-read).

### Zod

- [Branded types](https://zod.dev/api?id=branded-types) — type-only nominal tags obtainable only by parsing.
- [Basic usage](https://zod.dev/basics) and [Zod 3 docs](https://v3.zod.dev/) — the API for the version in use.

### Testing

- [Vladimir Khorikov — When to mock](https://enterprisecraftsmanship.com/posts/when-to-mock/) — real managed dependencies, mocks only for unmanaged ones.
- [Ham Vocke — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) — test kinds and their balance.
- [Testcontainers for Node.js](https://node.testcontainers.org/) and [getting started](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/) — real Postgres in tests.
- [Vitest — Mocking](https://vitest.dev/guide/mocking) — mocking API for unmanaged dependencies.

### Enforcement tooling

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) and its [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) — forbidden rules, group matching, type-only deps, cycles, baselines.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — ESLint alternative.
- [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) and [ts-arch](https://github.com/ts-arch/ts-arch) — architecture tests inside a test runner.
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html) — physical isolation per layer (too heavy for one package).

### Counterpoints

- [Jimmy Bogard — Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) — rigid layering creates needless abstractions and mocks; couple along the axis of change.
- [Kamil Grzybek — Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer) and [modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd) — modules as business capabilities with stable contracts.

## Version history

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-10-19 | Initial version: rings model, placement table, import matrix, three workflows, seven references, tested dependency-cruiser config |
| 1.1.0 | 2026-10-22 | Legacy policy: new code follows the target, extending legacy code is allowed and reported as a migration note (services taking the container are migrated in a dedicated refactor, not on every change); Workflow B separates introduced from pre-existing problems; the architecture check runs only if configured |

### Versioning policy

Semantic versioning, judged by the effect on an agent's output:

- **Major** — a default or rule changes so that previously correct output becomes wrong (e.g. requiring ports for
  every repository, allowing Zod in the domain).
- **Minor** — new guidance that doesn't contradict existing guidance (a new reference, a new placement row).
- **Patch** — wording, examples, links, typo fixes.

### Updating the skill

1. Change `SKILL.md` or a reference file; keep `SKILL.md` under 500 lines and references one level deep.
2. Bump `metadata.version` and add a row to the table above.
3. If a default changed, update "Default decisions and why".
4. If a rule changed, update `references/enforcement.md` and re-run the config against a real backend package.
5. Re-check links in this README.

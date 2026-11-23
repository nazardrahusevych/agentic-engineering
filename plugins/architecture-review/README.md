# architecture-review

An on-demand **architecture-reviewer** agent: it checks where code lives and which way its dependencies point, for a
diff, a branch or a module, and returns a short summary plus a JSON array of candidate findings.

```
/plugin marketplace add nazardrahusevych/agentic-engineering
/plugin install architecture-review@agentic-engineering
```

Depends on `engineering-paved-path`, which is installed with it: the reviewer preloads its
`onion-architecture`, `frontend-architecture` and `typescript-expert` skills and cites them in every finding.

## What it checks

| Area | Rules from |
|---|---|
| Backend layering: domain, application, adapters; allowed imports; transaction ownership | `onion-architecture` |
| Frontend layering: route, feature and shared layers; import direction; data layer; server/client boundaries | `frontend-architecture` |
| Module boundaries: other modules imported only through their public entry | both |
| Wiring: modules registered once, dependencies built in the composition root, no service locator | `onion-architecture` |
| Path aliases, shared contracts kept in sync, types leaking across layers | `typescript-expert` |
| Your own rules and legacy exceptions | your `CLAUDE.md` / `AGENTS.md` (they win over the skills) |

It does not review library style, security, tests or spec compliance.

## How to use it

Ask Claude to run `architecture-review:architecture-reviewer` with a target:

- a branch: "review the architecture of `feat/12-billing` against `main`";
- a range: "review `a1b2c3d..HEAD`";
- a module: "review `src/modules/billing/`".

Optionally pass the spec or plan so it understands the intent. If your project configures an architecture checker
(dependency-cruiser, eslint boundaries, …) and its instructions name the command, the reviewer runs it too.

## What you get back

A summary (files per area, layers touched, clean areas, checker status, gaps) and up to 15 findings:

```json
{ "rule": "cross-module-internal-import", "severity": "medium", "status": "introduced",
  "file": "src/modules/orders/service.ts", "line": 12,
  "message": "imports billing's repository directly", "fix": "import from src/modules/billing/index.ts",
  "source": "onion-architecture › Imports", "skill": "onion-architecture", "area": "backend" }
```

Findings are candidates: verify each before acting. Severity is `high` (breaks a dependency rule in a way that
spreads), `medium` (wrong layer or module, wiring outside the composition root) or `low` (misleading placement).

## Limits

- Read-only: no edits; Bash only for read-only git and the configured checker (by instruction — plugin agents cannot
  carry guard hooks).
- Not a gate: no verdicts. `sdd-engineering`'s `run-plan` turns confirmed findings into fix tasks.

Versions: [CHANGELOG.md](CHANGELOG.md).

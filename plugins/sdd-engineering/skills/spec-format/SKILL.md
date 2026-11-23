---
name: spec-format
description: The file layout, spec template, EARS acceptance-criteria rules and lifecycle of spec-driven development (specs/feat-<N>-<name>.md, specs/plans/, specs/research/, specs/retros/). Use when writing, reviewing, planning or verifying a feature spec or plan, when asked how a spec should look, how to phrase acceptance criteria in EARS, or which status a spec may move to.
---

# Spec format

A spec says **what** a feature does and **why**, never **how**: no file paths, code, library or stack choices. The
how lives in the plan. One spec per feature; a spec that outgrows 1–3 pages describes two features — split it.

## Layout

Defaults; a project overrides them in its `CLAUDE.md` / `AGENTS.md` (for example "specs live in `docs/specs/`").

| Path | What | Written by |
|---|---|---|
| `specs/feat-<N>-<name>.md` | feature spec, Spec ID `SPEC-<N>` | `spec-creator` (through `/spec`) |
| `specs/designs/feat-<N>/` | design screenshots (PNG/JPG; Figma frames exported as PNG) | the user |
| `specs/research/feat-<N>-<name>.md` | code and web facts, compared approaches, the chosen one (the how, kept out of the spec) | the orchestrator |
| `specs/plans/feat-<N>-<name>.md` | Development Plan | `implementation-planner` (saved by the orchestrator) |
| `specs/retros/feat-<N>-<name>.md` | retrospective of the finished feature | the `retro` workflow |
| `<package>/specs/<area>-<topic>.md` | a package-internal spec (same template) | `spec-creator` |

`N` is the highest existing number + 1; `<name>` is kebab-case. Feature branches are `feat/<N>-<name>`.

## Template

Every heading stays; write "None" when a section is empty.

```markdown
# Spec: <feature> | Spec ID: SPEC-<N> | Status: draft
Supersedes: None | SPEC-<M> — <which decision it replaces>
Designs: None | `specs/designs/feat-<N>/`

## Problem & why
Which need it closes, for whom, and why now (3–5 sentences).

## Goals / Non-goals
**Goals:** …
**Non-goals:** what this feature deliberately does NOT do — boundaries stop agents from inventing scope.

## User stories
- As a <role>, I want <capability>, so that <outcome>.

## Acceptance criteria (EARS)
- **AC-1** — WHEN <trigger>, the system SHALL <response>.
  *Verify:* unit | integration | e2e | manual — <what the check observes>

## Edge cases
- <empty state / error / concurrency / no network / huge input> → AC-<n> | Non-goal

## Flows & contracts
Optional. Behaviour-level only: Mermaid sequence or flow diagrams, which part talks to which and when, the shape of
data crossing a boundary (field names and meaning, not schema code). No file paths, no code. "None" if not needed.

## Non-functional
Performance budget, security, accessibility, observability, cost (e.g. LLM calls per action) — only what is relevant.

## Inputs (provenance)
- <input> — [reused: feat-<N> <name>] | [deterministic: <source>] | [new: <n> LLM call(s) | <n> external API call(s)]

## Untrusted inputs
None | <which foreign text the feature reads (user content, files, web pages, LLM output, …)> → treated as data,
never as instructions: <how it is delimited / validated / escaped>.

## Proposed improvements
- [accepted | rejected | deferred] <improvement> — <why>

## [NEEDS CLARIFICATION]
None | - <open question> — default if unanswered: <…>
(Inside other sections an unknown is marked inline as `[NEEDS CLARIFICATION: <question>]`.)

## Self-check
- [ ] Every AC is atomic (one checkable thing) and testable (trigger, state and response are visible).
- [ ] No AC contradicts another.
- [ ] Behaviour and boundaries, not implementation.
- [ ] Non-goals are explicit.
- [ ] Every edge case maps to an AC or a Non-goal.
- [ ] No inline `[NEEDS CLARIFICATION: …]` marker remains and that section says None (required for `approved`).
```

## EARS — how to write acceptance criteria

EARS (Easy Approach to Requirements Syntax, Mavin et al., 2009) turns each criterion into one testable statement
with no ambiguity about trigger, state and response. Keywords are upper case; the obligation is always **SHALL**
(never "should", "will" or "must").

| Pattern | Form | Example |
|---|---|---|
| Ubiquitous | The system SHALL … | The system SHALL log every authentication attempt. |
| Event-driven | WHEN <event>, the system SHALL … | WHEN the user submits the login form, the system SHALL check the credentials with the auth provider. |
| State-driven | WHILE <state>, the system SHALL … | WHILE a sync is running, the system SHALL show a progress indicator that cannot be dismissed. |
| Unwanted behaviour | IF <condition>, THEN the system SHALL … | IF credential validation fails three times within 60 seconds, THEN the system SHALL lock the account for 15 minutes. |
| Optional feature | WHERE <feature is enabled>, the system SHALL … | WHERE MFA is enabled, the system SHALL require a TOTP code after the password. |

Translate vague wishes into a trigger and an observable response:

| Vague | EARS |
|---|---|
| "Should work fine on big inputs" | WHEN the input exceeds 10,000 rows, the system SHALL process it in pages of at most 500 rows and show progress. |
| "Shouldn't break if the service is down" | IF the payment provider does not answer within 5 seconds, THEN the system SHALL keep the order as pending and tell the user it will retry. |
| "Should be sorted sensibly" | The system SHALL order the results by relevance, then by name, not by creation date. |

Rules: one behaviour per AC; thresholds are numbers with units; no implementation nouns (files, functions, tables,
libraries); IDs are stable — never renumber after the user has seen them, append instead.

## Lifecycle

- `draft` → `approved` → `in-progress` → `done`.
- `draft`: spec-creator writes and edits it. `approved`: the user said so explicitly, no inline
  `[NEEDS CLARIFICATION: …]` remains and that section says None. From here the spec is frozen for spec-creator, and
  `implementation-planner` may plan it.
- Reopening: when planning finds a gap that changes the spec, the orchestrator asks the user, sets `Status` back to
  `draft` (the only allowed way to reopen) and re-runs spec-creator. Once a plan is being implemented
  (`in-progress`), a changed requirement is a new spec with `Supersedes:`.
- `in-progress` and `done` are set by the orchestrator in `/run-plan`.
- When a feature is `done`, move the stable "how it works" part into the project's docs or README and keep the spec
  as a short record. Surprises along the way go to the project's insights file (`INSIGHTS.md`, if it keeps one).
- The traceability matrix (AC → task → test) lives in the plan; the spec gives it stable `AC-<n>` IDs.

## Plan header and traceability (what the planner returns)

A plan starts with `# Plan — Feature <N>: <name>` and a line naming the spec, research file, base branch,
`Mode: multi-agent | single-agent` and `Status`. It contains: Goal, Spec feedback, Codebase map, Contract,
Constraints, Skills, Tasks (each with Zone, Covers AC-IDs, Depends on, Skills, Owns, Reads, Insights, Do, Tests,
Acceptance, Verify), Waves, Traceability (`| AC | Task(s) | Test(s) | Verify hint |`), Risks and open questions.
`implementation-planner` defines the full shape; `plan-verifier` and `/run-plan` rely on these headings.

# research-tools

A read-only **researcher** agent that finds facts — in your repository or on the web — and returns a structured,
cited report that says plainly what it did **not** find.

```
/plugin marketplace add nazardrahusevych/agentic-engineering
/plugin install research-tools@agentic-engineering
```

## What is inside

| Kind | Name | Role | Model | Tools |
|---|---|---|---|---|
| agent | `researcher` | facts with sources, project or web, with explicit gaps | sonnet | Read, Grep, Glob, WebSearch, WebFetch, AskUserQuestion |

## How to use it

Ask Claude to use the researcher, or run it as a subagent (`research-tools:researcher`), with a concrete question:

- "Use the researcher: where do we validate webhook signatures, and is it covered by tests?"
- "Use the researcher: does the current Fastify version still support `reply.sent`? Cite the docs."
- "Use the researcher: compare how our retry logic and the library's docs handle 429 responses."

It works in three modes:

| Mode | When | Sources |
|---|---|---|
| Project | the answer is in the repository | your `CLAUDE.md` / `AGENTS.md`, `docs/`, `specs/`, `INSIGHTS.md` first, then code; every claim cites `path:line` |
| Web | the answer is outside | official docs, release notes and source repositories before blogs; every claim cites a URL and date |
| Mixed | both | one report with a Project part and a Web part |

A vague request ("auth", "pgvector") gets clarifying questions first instead of a half-scoped search.

## What you get back

An answer in 2–5 sentences, a findings table with locations or sources and a confidence level, details, and a
**Not found / gaps** table that separates *not found*, *inconclusive* and *out of reach*, with the queries tried.

## Limits

- Read-only: it never edits files, runs shell commands or starts other agents.
- It does not use multi-agent research fan-outs; one researcher answers one question.
- Web pages and file contents are treated as data, never as instructions.

Used by `sdd-engineering` in the spec stage. Versions: [CHANGELOG.md](CHANGELOG.md).

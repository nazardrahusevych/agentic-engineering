---
name: engineering-insights
description: Records important, new and non-obvious engineering insights in the INSIGHTS.md of the module the insight is about (cross-cutting ones in the root INSIGHTS.md). Use proactively in any session the moment something non-obvious is confirmed — a fix that took more than one attempt, a dead end, an unwritten convention, a library or platform quirk, an error with a non-obvious cause — and once more before reporting a non-trivial task as done. Also use when the user says "insight", "lesson learned", "remember this" or "wrap up".
allowed-tools: Edit(**/INSIGHTS.md)
---

# Engineering insights

Bar: important, new and confirmed only. Writing nothing is the normal outcome — never log a session for its own sake.

1. **Pick the file.** Module root = the nearest directory above the code the insight is about that has an `AGENTS.md`
   or `package.json` (e.g. `api/`, `api/src/modules/billing/`). Cross-cutting (several modules, `scripts/`,
   Docker, CI, root config) → root `INSIGHTS.md`. File missing → create it from [template.md](template.md).
2. **Filter.** Write only what is confirmed (the fix works, the test passes) and would save the next session 5+ minutes.
   Skip what is obvious from reading the code, generic best practice, one-off issues, and anything already in
   `AGENTS.md` / `CLAUDE.md`, `docs/` or the file itself (grep it first). Already there and it bit again → suggest promoting one
   line to that module's `AGENTS.md` → Gotchas instead of adding a duplicate.
3. **Pick the section.**
   - What Works — an approach that worked after a non-obvious path
   - What Doesn't Work — a dead end or antipattern, and why
   - Codebase Patterns — an unwritten convention or architectural rule
   - Tool & Library Notes — a dependency or platform quirk
   - Recurring Errors & Fixes — error → root cause → fix
   - Session Notes — one line, only for a session that changed the module significantly
   - Open Questions — worth chasing but not confirmed yet
4. **Append only.** Add one bullet at the end of that section. Never edit, reorder or delete existing lines;
   if an entry is wrong, append a dated correction that names it. The only exception is Curation below.
5. **Write it cold:** `- YYYY-MM-DD — <what is true> → <what to do>. (<path>[:<line>])`. A reader without this
   session's context must know what to do. Needs a paragraph → it is documentation and belongs in `docs/`.
6. **When.** Right after something is confirmed, plus one pass before reporting a non-trivial task as done.
   Usually 0–1 entries, at most 3 per pass.
7. **Report.** One line per entry (file → section), or "No new insights." If a file passes ~200 entries, say it is
   due for curation (dedupe, drop stale entries, promote recurring ones).

## Curation

Removing, moving or rewriting existing entries is allowed only when applying a curation proposal (keep / duplicate /
stale / promote, with evidence per entry) that the user approved, entry by entry. Apply it in its own commit
(`chore(insights): curate …`), add the promoted lines to their targets in the same commit, and append one Session
Notes line to each changed INSIGHTS file: `- YYYY-MM-DD — Curated: <n> removed, <n> promoted (<targets>).`

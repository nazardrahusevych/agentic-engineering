# Security Checklists — Quick Reference

Compact checklists for common changes. Use them for self-review before committing or opening a PR; the reasoning
behind each item is in [SKILL.md](SKILL.md).

---

## Pre-commit self-review

- [ ] No keys, tokens or passwords in code, fixtures, logs or test snapshots
- [ ] No `.env`, secret files or runtime data directories staged
- [ ] Every new tenant query filters by the tenant id (if the app is multi-tenant)
- [ ] Untrusted text (user content, file contents, model output) is wrapped or parsed at its boundary
- [ ] No `exec()`, `shell: true`, `eval`, `new Function` or `sql.raw()` with data
- [ ] 5xx responses and error `details` carry no internals or secrets
- [ ] No `dangerouslySetInnerHTML` added; data-built links allow only `http(s)`

---

## New or changed API route

### Access
- [ ] Handler resolves the caller's context from the auth layer; no tenancy ids from body/query/headers
- [ ] Use case / repository scope every read and write by the tenant id
- [ ] Other-tenant ids produce 404 (`NotFoundError`)
- [ ] Expensive work (model call, long-running operation) has a per-route rate limit or is queued as a job

### Input
- [ ] `params` / `querystring` / `body` declared as Zod schemas (no manual parse, no casts)
- [ ] String lengths and array sizes bounded where they feed prompts, child processes or the database
- [ ] Unknown keys stripped (default) — the use case receives only the parsed shape

### Output
- [ ] `response` schema declared, reusing the shared contract (whitelists fields)
- [ ] No secrets, tokens, absolute local paths or raw provider errors in the response

---

## New adapter, child process or file access

- [ ] External tool called with an argument array, no shell; `--` before data-derived arguments
- [ ] Refs / SHAs / identifiers validated before reaching a CLI
- [ ] Timeout set; failure translated to the project's external-service error and logged without secrets
- [ ] Paths built from data are validated per segment and checked to stay inside the root directory
- [ ] Nothing from untrusted content is executed (no installs, builds, tests, hooks)
- [ ] Credentials passed per call (headers, env for the child process), not embedded in stored URLs

---

## Prompt or LLM change

- [ ] All untrusted text goes through the untrusted-text wrapper; nothing untrusted in the system prompt
- [ ] The injection guard is still appended on every code path that assembles a prompt
- [ ] No keyword filtering or stripping of untrusted text
- [ ] Model output parsed with a Zod schema; failures become a failed step, not a crash
- [ ] Model claims checked against the source; derived values (scores, verdicts) recomputed, not taken from the model
- [ ] Token budget respected for large inputs (caps, slicing)
- [ ] Any third-party write uses parsed, validated data and is triggered by the user or an explicit policy

---

## Client rendering

- [ ] Untrusted text rendered as text or via a markdown component without raw HTML
- [ ] Mermaid stays `securityLevel: "strict"`
- [ ] `href`/`src` from data: protocol allowlist `http:`/`https:`; external links `rel="noopener noreferrer"`
- [ ] No secrets in `NEXT_PUBLIC_*`; no keys in `localStorage`

---

## Secrets

- [ ] Read through the project's secrets abstraction, lazily, at the point of use
- [ ] Missing key → a configuration error for that feature only
- [ ] Not logged, not returned, not stored in the DB or traces
- [ ] Settings/status endpoints return booleans, never values

---

## New dependency

- [ ] **Need:** can existing dependencies or Node built-ins do it?
- [ ] **Health:** maintained, widely used, no open critical advisories (`pnpm audit` / `npm audit`)
- [ ] **Name:** not a typosquat of a popular package
- [ ] **Access:** what it touches (network, fs, env, native code); install scripts need explicit approval
- [ ] **Lockfile:** committed with the package manager that package uses
- [ ] **Native modules:** exact version pin

---

## Incident response (key leaked or bad third-party write)

1. Revoke the affected key/token at the provider and store a new one.
2. Check traces and logs for the window; remove leaked material from them.
3. Delete or correct anything written to third parties by the affected operation.
4. Add a regression test or a checklist item; record a non-obvious cause in INSIGHTS.md (if the project keeps one).

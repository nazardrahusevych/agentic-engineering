---
name: security
description: "Security review and secure-coding rules for TypeScript web apps (Fastify/Node API, Postgres, Next.js client) that may call LLMs, mapped to OWASP Top 10:2025 and OWASP agentic/LLM risks — tenant scoping, untrusted content and prompt injection, LLM output handling, child processes, filesystem paths, secrets, rendering untrusted text in a React/Next.js client, HTTP hardening (helmet, CORS, rate limit), outbound requests, supply chain and logging. Use when reviewing a diff for vulnerabilities, adding a route, adapter, child process, file access, prompt or outbound request, handling secrets, or adding a dependency."
---

# Security

## Start from the threat model

Before reviewing, write down (or read from the project's CLAUDE.md / AGENTS.md, docs or INSIGHTS.md, if any) the
project's threat model in three lists:

**What an attacker controls** — typical sources:
- request data (body, query, params, headers, cookies) from any client;
- third-party content the app ingests: uploaded files, repository contents, emails, web pages, webhook payloads;
- therefore also **LLM output**, which that content can steer (prompt injection);
- third-party API responses (shapes can change, values come from third parties).

**What we protect** — typical assets:
- API keys, OAuth/access tokens and other credentials — they cost money and grant access elsewhere;
- write actions against third parties (posting comments, sending messages, payments) — injected content must not
  make the app perform them;
- the host filesystem (working directories and everything outside them);
- data separation between tenants/workspaces, if the app is multi-tenant.

**What we never do** — e.g. execute code that came from untrusted content (installs, builds, scripts).

## Core philosophy — confidence-based review

Before flagging anything, **trace the data flow** and confirm the source.

| Confidence | Criteria | Action |
|------------|----------|--------|
| **HIGH** | Vulnerable pattern + attacker-controlled input confirmed (untrusted content, LLM output, request data) | **Report** with file, line, exploit path and fix |
| **MEDIUM** | Vulnerable pattern, input source unclear | **Note** for manual verification (doesn't block) |
| **LOW** | Theoretical / best-practice deviation | **Do not report** unless asked |

**Do NOT flag**: test files, dead code, server-controlled values (config constants, `config.*`), framework-mitigated
patterns (React JSX escaping, Drizzle parameter binding, Zod-validated route input).

> **Golden rule**: `spawn(rgPath, ['--', pattern])` with a constant pattern is safe;
> `spawn(…, { shell: true })` with a file name from user content is not. Always ask: **"Can untrusted content or
> the model reach this value?"**

---

## OWASP Top 10:2025 — where it typically shows up

| # | Category | Typical places |
|---|----------|----------------|
| A01 | Broken Access Control | queries without the tenant filter; ids from body/query trusted for tenancy; paths escaping a root dir |
| A02 | Security Misconfiguration | CORS widened, helmet removed, rate limit disabled outside tests, 5xx messages with internals |
| A03 | Supply Chain Failures | unpinned native deps, lockfile drift, approving install scripts, typosquats |
| A04 | Cryptographic Failures | secrets in logs/responses/commits, tokens persisted in stored URLs or config files |
| A05 | Injection | shell/argument injection into child processes, `sql.raw()` with data, prompt injection, XSS in rendered content |
| A06 | Insecure Design | third-party write actions driven by unchecked model output, unbounded LLM spend |
| A07 | Authentication Failures | an auth provider or hook that fails open |
| A08 | Software/Data Integrity | casting LLM output or `jsonb` instead of parsing; trusting a model's score/verdict |
| A09 | Logging & Alerting | keys or full prompts in stdout logs; silent failures of background jobs |
| A10 | Exceptional Conditions | fail-open error paths, unhandled rejections in jobs, missing degraded mode |

---

## A01 — Access control and tenancy

If the app is multi-tenant (workspaces, organizations, accounts):

- Every handler resolves the caller's context (user, tenant) from the auth layer; every tenant query filters by the
  tenant id (selects, updates, deletes). Child tables are written only after the parent was loaded with the scope.
- An id from another tenant returns **404**, not 403.
- Never take the tenant id or user id from the body, query or headers.
- Data-dependent authorization lives in the use case; caller-only checks may be a scoped hook.

## A05 / Agentic — Prompt injection and LLM output

- Have **one** prompt-assembly function that appends a fixed injection guard to the system prompt and wraps every
  piece of untrusted text (user content, documents, code, derived summaries) in a delimited block, e.g.
  `wrapUntrusted(label, content)`; it must neutralize attempts to close the delimiter.
- **Instructions are not data**: content that is meant to instruct the model (e.g. user-authored prompts or
  skills) can't be wrapped as untrusted, so the trust boundary is the user instead. Third-party instructions are
  stored **disabled** and labeled as someone else's until a user reviews and enables them. A change that enables
  third-party instructions automatically is a finding.
- **No keyword scanning, stripping or "sanitizing" of untrusted text** — it catches one phrasing in one language and
  corrupts the content. Harden the guard instead.
- Untrusted text is never placed in the system prompt or concatenated outside the untrusted block.
- Cap sizes of untrusted inputs so content can't blow the token budget.
- **LLM output is untrusted data:** parse it with a Zod schema at the boundary; check claims against the source
  (e.g. drop references to lines or records that don't exist); recompute derived values such as scores from the
  validated data — never trust the model's score, verdict or claimed severity alone.
- **Prefer models with no tools that act.** Any tool use must be read-only or require explicit user confirmation;
  third-party writes happen only from use-case code with parsed, validated data.
- Never execute, `eval`, or write to disk code suggested by the model.

## A05 — Child processes (git, ripgrep, any CLI)

- Call external tools with argument arrays (`spawn(cmd, args)`, or a library such as `simple-git`), never `exec()`,
  never `shell: true`, never a command string built from data.
- Put `--` before any argument that comes from data (patterns, paths, refs) so it can't be read as an option
  (`--upload-pack=…`, `--pre=…`).
- Validate identifiers from third parties before they reach a CLI (`^[0-9a-f]{40}$` for git SHAs, no leading `-` for
  refs).
- Disable interactive prompts (`GIT_TERMINAL_PROMPT=0` for git); keep timeouts on every external process.

## A01/A05 — Filesystem paths

- Path segments from URLs, requests or third parties must be validated (no `..`, no `/` or `\`, no leading `.`), and
  the final path must be checked: `resolve(p).startsWith(resolve(rootDir) + sep)`.
- File paths from user content or the model are relative to a known root; normalize them and check they stay inside
  it before reading.
- Never follow symlinks out of the root when reading files for prompts or indexes.

## A04 — Secrets

- Read keys through one secrets abstraction (a provider or config module), lazily, at the point of use; never
  scatter `process.env.*_KEY` across feature code.
- Never log, return, persist in the DB, put in error `details`, or send to the client a key or token. Status
  endpoints report *whether* a key is set.
- Local secret files are written with mode 0600; `.env` files and secret files are never committed.
- Tokens must not end up in places that outlive the request: URLs that are logged or stored, git remotes
  (`.git/config`), traces.

## A05 — Rendering untrusted text in the client

- React escapes JSX text — the default safety net. User content and model output are rendered as text or through a
  markdown component (e.g. react-markdown **without** raw HTML / `rehype-raw`).
- `dangerouslySetInnerHTML` only for static, developer-authored content (e.g. a theme no-flash script).
- Mermaid diagrams render with `securityLevel: "strict"`; don't relax it.
- `href`/`src` built from data allow only `http:`/`https:` (no `javascript:`/`data:`); external links get
  `rel="noopener noreferrer"`.
- `NEXT_PUBLIC_*` variables are public: no secrets there.

## A10/SSRF — Outbound requests

- Keep outbound hosts fixed (the third-party APIs and LLM providers the app integrates with). Never fetch a URL taken
  from user content or model output.
- If a configurable base URL is needed (self-hosted model, enterprise API host), validate it against an allowlist of
  schemes and hosts set by an administrator in settings, not by request data.

## A02 — HTTP hardening (Fastify)

- `@fastify/helmet`, `@fastify/cors` with an explicit origin list (and `credentials: true` only if needed) — never
  `*` or `true`.
- `@fastify/rate-limit` globally (off only in tests); expensive routes (LLM calls, long jobs) get a stricter
  per-route limit.
- A small `bodyLimit`; validation failures → 4xx; 5xx responses carry no internals.

## A03 — Supply chain

- Lockfiles are committed and installs are frozen in CI (`pnpm install --frozen-lockfile`, `npm ci`); a
  `package.json` change ships with its lockfile change from the package manager that package uses.
- pnpm 10 does not run dependency install scripts unless approved (`pnpm approve-builds`); approving one is a
  decision to record in the PR.
- Native modules stay exact-pinned.
- Before adding a dependency: is it needed, maintained, widely used, and what does it access (network, fs, env)?
  Watch for typosquats.

## A09 — Logging

- Structured logging (e.g. pino via Fastify: `req.log`, `app.log`). No `console.log` in server code.
- Never log keys, tokens, `authorization` headers or secret-file contents.
- Keep raw prompts and user content out of stdout logs; use dedicated traces for that detail.
- Failures of jobs and background work are logged with their id and surfaced to the user — never swallowed.

## A10 — Exceptional conditions

- Fail closed: an error in a check denies the action; an auth hook throws, it never falls through.
- Optional sources degrade (a `degraded` result, a disabled feature) instead of failing the whole operation.
- Jobs have timeouts and log their failure; no floating promises.
- `JSON.parse` of anything external sits inside a parse that can fail (Zod `safeParse`).
- `RegExp` from user or model data: escape it, or use a fixed-string search (e.g. ripgrep `-F`).

---

## Known weak spots

If the project lists known, pre-existing weak spots (in its docs or INSIGHTS.md), don't copy them: a diff that
extends one is a finding; a diff that only sits next to one is not.

---

## Security review process

1. **Detect context** — route, adapter, child process, file access, prompt/LLM, client rendering, config,
   dependency.
2. **Load relevant rules** — only the sections above that apply.
3. **Trace data flow** — does untrusted content, model output or request data reach the sink?
4. **Check upstream controls** — Zod route schema, untrusted-text wrapping, output validation, tenant scoping already
   applied?
5. **Verify exploitability** — can it actually be reached and controlled in this deployment?
6. **Report HIGH confidence only** as findings — file, line, exploit path, specific fix. MEDIUM goes to "check
   manually".

## Severity classification

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Direct exploit from untrusted content or another origin, no user action | command/argument injection into a child process, path traversal writing outside the root dir, a key returned by an endpoint |
| **HIGH** | Exploitable with conditions | unscoped query (cross-tenant read), untrusted text outside the untrusted block, model output sent to a third party unparsed, XSS through rendered markdown |
| **MEDIUM** | Specific conditions, limited impact | CORS widened, missing per-route rate limit on a model call, 5xx leaking internals, token stored in a git remote |
| **LOW** | Defense in depth | missing audit log line, overly broad error `details` without secrets |

References: [checklists.md](checklists.md) · [examples.md](examples.md) · [references.md](references.md)

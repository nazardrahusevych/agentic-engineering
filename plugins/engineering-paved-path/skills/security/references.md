# Security Skill — References and Sources

Sources behind this skill.

---

## OWASP official resources

### OWASP Top 10:2025
- **Official page**: https://owasp.org/Top10/2025/en/
- **Introduction**: https://owasp.org/Top10/2025/0x00_2025-Introduction/
- What changed in 2025: A03 became "Software Supply Chain Failures"; A10 "Mishandling of Exceptional Conditions"
  is new; Broken Access Control stays #1; Security Misconfiguration moved to #2.

| # | Category |
|---|----------|
| A01 | Broken Access Control |
| A02 | Security Misconfiguration |
| A03 | Software Supply Chain Failures |
| A04 | Cryptographic Failures |
| A05 | Injection |
| A06 | Insecure Design |
| A07 | Authentication Failures |
| A08 | Software/Data Integrity Failures |
| A09 | Security Logging & Alerting Failures |
| A10 | Mishandling of Exceptional Conditions |

### OWASP Top 10 for LLM Applications and agentic risks
- https://genai.owasp.org/ — prompt injection (LLM01), insecure output handling, excessive agency, sensitive
  information disclosure, unbounded consumption; the agentic security initiative (goal hijacking, tool misuse,
  identity abuse, code execution)

### ASVS 5.0
- https://owasp.org/www-project-application-security-verification-standard/

### Cheat sheets
- Injection prevention: https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html
- OS command injection defense: https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html
- Path traversal: https://owasp.org/www-community/attacks/Path_Traversal
- SSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Logging: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- Secrets management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

---

## Stack documentation

- Fastify security plugins: https://github.com/fastify/fastify-helmet, https://github.com/fastify/fastify-cors,
  https://github.com/fastify/fastify-rate-limit
- Drizzle `sql` templates and parameter binding: https://orm.drizzle.team/docs/sql
- react-markdown security notes (no raw HTML by default, URL transform): https://github.com/remarkjs/react-markdown#security
- Mermaid `securityLevel`: https://mermaid.js.org/config/usage.html#securitylevel
- Git option injection and `--`: https://git-scm.com/docs/gitcli
- pnpm install scripts and `approve-builds`: https://pnpm.io/cli/approve-builds

---

## Review approach

- Confidence-based reporting (report only when the attacker-controlled source is confirmed) follows the approach of
  Sentry's security-review skill: https://github.com/getsentry/skills
- Differential (diff-focused) security review and insecure-defaults detection: Trail of Bits skills,
  https://github.com/trailofbits/skills

---
title: Never Trust JSON.parse Output
impact: CRITICAL
impactDescription: JSON.parse returns any type; unvalidated JSON allows type confusion attacks and runtime crashes
tags: parse, json, security, type-safety
---

## Never Trust JSON.parse Output

`JSON.parse()` returns `any` (or `unknown` in strict mode), providing no type guarantees. Always validate JSON output with Zod before using it, even if you control the JSON source. This catches corruption, version mismatches, and ensures type safety.

**Incorrect (trusting JSON.parse):**

```typescript
// JSON.parse returns any - no type safety
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'))
// config is 'any' - TypeScript allows anything

// This might crash at runtime if structure changed
console.log(config.database.host)  // TypeError: Cannot read property 'host' of undefined

// API response - also unvalidated
const response = await fetch('/api/user')
const user = await response.json()  // any type
console.log(user.name.toUpperCase())  // Crash if name is null/undefined
```

**Correct (validate after JSON.parse):**

```typescript
import { z } from 'zod'

const configSchema = z.object({
  database: z.object({
    host: z.string(),
    port: z.number(),
    name: z.string(),
  }),
  api: z.object({
    key: z.string(),
    timeout: z.number().default(5000),
  }),
})

// Parse JSON then validate
const rawConfig = JSON.parse(fs.readFileSync('config.json', 'utf-8'))
const config = configSchema.parse(rawConfig)
// config is fully typed: { database: { host: string, ... }, ... }

// API response validation
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const response = await fetch('/api/user')
const rawUser = await response.json()
const user = userSchema.parse(rawUser)
// user is fully typed and validated
```

**Helper for validated JSON parsing:**

```typescript
function parseJSON<T>(schema: z.ZodType<T>, json: string): T {
  return schema.parse(JSON.parse(json))
}

function safeParseJSON<T>(schema: z.ZodType<T>, json: string) {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { success: false as const, error: 'Invalid JSON' }
  }
  // safeParse instead of parse + `instanceof z.ZodError`: if two packages load their own Zod
  // instance, instanceof can miss errors created by the other one.
  const result = schema.safeParse(raw)
  return result.success
    ? { success: true as const, data: result.data }
    : { success: false as const, error: result.error.issues }
}

// Usage
const config = parseJSON(configSchema, fs.readFileSync('config.json', 'utf-8'))
```

**Where this typically applies:**

- **LLM output** — model text is parsed with a schema at the boundary; garbage becomes a failed step, never a
  crash or a cast.
- **`jsonb` columns** — `row.trace as RunTrace` is a cast, not a parse. Parse stored JSON in the repository mapper
  with a tolerant schema (new fields `.nullish()`).
- **Files** — local config and secret files, any file content read at runtime.
- **External APIs** — third-party responses inside the adapters.
- **Client storage** — `localStorage` values.

**Validate localStorage/sessionStorage:**

```typescript
const cartSchema = z.array(z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
}))

function getCart() {
  const raw = localStorage.getItem('cart')
  if (!raw) return []

  const result = cartSchema.safeParse(JSON.parse(raw))
  if (!result.success) {
    // Corrupted cart data - clear it
    localStorage.removeItem('cart')
    return []
  }
  return result.data
}
```

**When NOT to use this pattern:**
- When you genuinely need to pass through arbitrary JSON without processing

Reference: [Zod API - parse](https://zod.dev/api#parse)

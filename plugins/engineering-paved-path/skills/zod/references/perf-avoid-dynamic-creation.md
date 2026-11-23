---
title: Avoid Dynamic Schema Creation in Hot Paths
impact: LOW-MEDIUM
impactDescription: Building a schema allocates and wires every node; doing it per item or per request repeats that work on every call
tags: perf, dynamic, hot-path, optimization
---

## Avoid Dynamic Schema Creation in Hot Paths

Building a Zod schema allocates every node and wires refinements; that work is wasted when it is repeated for each item or request. Avoid creating schemas inside loops or frequently-called functions — pre-create them at module level instead. (This skill targets Zod 3; Zod 4 adds JIT compilation, which makes per-call creation even more expensive.)

**Incorrect (schema creation in hot path):**

```typescript
import { z } from 'zod'

async function validateBatch(items: unknown[]) {
  const results = []

  for (const item of items) {
    // Schema created for EACH item - slow!
    const schema = z.object({
      id: z.string(),
      value: z.number(),
    })

    results.push(schema.safeParse(item))
  }

  return results
}

// 1000 items = 1000 schema creations
```

**Correct (pre-created schema):**

```typescript
import { z } from 'zod'

// Schema created ONCE
const itemSchema = z.object({
  id: z.string(),
  value: z.number(),
})

async function validateBatch(items: unknown[]) {
  // Reuse the same schema instance
  return items.map(item => itemSchema.safeParse(item))
}

// 1000 items = 1 schema creation + 1000 fast parses
```

**Dynamic schemas with caching:**

```typescript
import { z } from 'zod'

// Cache for dynamically-configured schemas
const schemaCache = new WeakMap<object, z.ZodType>()

function getSchemaForConfig(config: { fields: string[] }) {
  // Check cache first
  if (schemaCache.has(config)) {
    return schemaCache.get(config)!
  }

  // Create and cache
  const shape: Record<string, z.ZodString> = {}
  for (const field of config.fields) {
    shape[field] = z.string()
  }

  const schema = z.object(shape)
  schemaCache.set(config, schema)
  return schema
}

// Subsequent calls with same config reuse cached schema
```

**Lazy schema creation:**

```typescript
import { z } from 'zod'

// Schema created only when first used
let _userSchema: z.ZodObject<any> | null = null

function getUserSchema() {
  if (!_userSchema) {
    _userSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      profile: z.object({
        name: z.string(),
        avatar: z.string().url().optional(),
      }),
    })
  }
  return _userSchema
}

// Or use a getter
const schemas = {
  _user: null as z.ZodType | null,
  get user() {
    if (!this._user) {
      this._user = z.object({ /* ... */ })
    }
    return this._user
  }
}
```

**When NOT to use this pattern:**
- One-off validation where schema is used once
- Dynamically generated forms where fields change per request
- Test files where performance doesn't matter

Reference: [Zod 3 documentation](https://v3.zod.dev/)

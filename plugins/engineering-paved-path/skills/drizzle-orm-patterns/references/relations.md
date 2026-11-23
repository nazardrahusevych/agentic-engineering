# Relations (Drizzle 0.38)

## Default: no relations

You can define **no** `relations()` and skip the relational query API (`db.query.*.findMany({ with })`).
Repositories then read with the SQL-like builder: `db.select(...).from(...).innerJoin/leftJoin(...)` and map rows to
contract shapes themselves (see `queries-joins-aggregations.md`). Foreign keys are declared on columns with
`.references(() => …)`; that is what the database enforces.

Add relations only when a feature clearly benefits from nested reads. Then:

- use the **v1 API** `relations()` from `drizzle-orm` — the only one in 0.38. `defineRelations()` and
  `r.many.*().through()` belong to Drizzle 1.0 and do not exist here;
- declare the relations in the same schema file as the tables and export them through `db/schema.ts`
  (`createDb` passes the whole schema to `drizzle()`, so `db.query` picks them up);
- use `db.query` only inside repositories, and still map the result before returning it.

## v1 syntax reference

```typescript
import { relations } from 'drizzle-orm';

// one-to-many: an agent has many versions
export const agentsRelations = relations(agents, ({ many }) => ({
  versions: many(agentVersions),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, { fields: [agentVersions.agentId], references: [agents.id] }),
}));

// many-to-many goes through the junction table (agent_skills)
export const agentSkillsRelations = relations(agentSkills, ({ one }) => ({
  agent: one(agents, { fields: [agentSkills.agentId], references: [agents.id] }),
  skill: one(skills, { fields: [agentSkills.skillId], references: [skills.id] }),
}));
```

```typescript
// repository.ts — scope the root by workspace; children come through the relation
const agent = await this.db.query.agents.findFirst({
  where: and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)),
  with: { versions: { columns: { version: true, createdAt: true } } },
});
return agent ? toAgentModel(agent) : undefined;
```

- Relations are a query-time feature only; they create no constraints and need no migration.
- Self-references: type the column as `(): AnyPgColumn => table.id` and give both sides a `relationName`.
- Never load a child collection without first scoping the parent by `workspaceId`.

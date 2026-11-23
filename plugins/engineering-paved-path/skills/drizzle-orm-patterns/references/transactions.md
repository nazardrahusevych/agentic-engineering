# Transactions

**Who opens a transaction** is an architecture rule: the use case owns the boundary through a `TransactionRunner`
port and repositories run on the executor they are given — see `onion-architecture`
(`references/persistence-drizzle.md` → "Transactions"). This file covers the Drizzle mechanics.

> A common legacy smell: a multi-step write (e.g. delete and re-insert child rows) without a transaction. New
> multi-step writes must not copy it.

## When a transaction is required

- delete-and-reinsert of child rows;
- insert a parent, then its children;
- update a status and write a related row (version snapshot, audit row);
- any read-check-write that must not interleave with another request (use a row lock or a unique constraint).

## Mechanics

```typescript
// infrastructure: the runner the composition root injects
export type DbExecutor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export const drizzleTransactions = (db: Db): TransactionRunner<DbExecutor> => ({
  run: (work) => db.transaction((tx) => work(tx)),
});

// repository: every method that can join a transaction takes an optional executor.
// pr_files is a child table keyed by pr_id; the use case loaded the pull with its workspace scope first.
async replaceFiles(prId: string, files: PrFileInput[], exec: DbExecutor = this.db) {
  await exec.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
  if (files.length > 0) await exec.insert(t.prFiles).values(files.map((f) => toPrFileRow(prId, f)));
}

// service (use case): scope check and network calls first, then write everything in one transaction
const pull = await this.deps.pulls.get(workspaceId, pullId); // throws NotFoundError outside the workspace
const { files, commits } = await this.deps.github.getPullDetail(pull.repo, pull.number); // OUTSIDE the transaction
await this.deps.tx.run(async (tx) => {
  await this.deps.pulls.replaceFiles(pull.id, files, tx);
  await this.deps.pulls.replaceCommits(pull.id, commits, tx);
});
this.deps.runBus.publish(/* … */); // side effects AFTER commit
```

## Rules

- **Abort by throwing** from the callback (a domain error is fine). Drizzle rolls back and rethrows.
  `tx.rollback()` also works but throws its own error type — don't let it leak to inner rings.
- **Keep transactions short:** no LLM, GitHub, git or file-system calls inside. postgres-js holds one pooled
  connection (pool max 10) for the whole callback.
- **Side effects after commit:** enqueue jobs, publish SSE events, post GitHub comments only once `run()` resolves.
- **Savepoints:** `tx.transaction(...)` inside a transaction is a savepoint; use it only for a deliberate partial
  rollback.
- **Isolation level:** the default `read committed` is enough for almost everything. If a use case needs
  `serializable`, pass `{ isolationLevel: 'serializable' }` and be ready to retry on serialization failures.
- Scoping still applies inside the transaction: tenant tables filter by `workspaceId`; child tables (keyed by
  their parent's id) are written only after the parent was loaded with the workspace scope.

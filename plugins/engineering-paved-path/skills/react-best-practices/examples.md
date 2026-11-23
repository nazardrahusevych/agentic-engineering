# React Best Practices — Code Examples

Good/bad patterns for each rule in [SKILL.md](SKILL.md), written for a React / Next.js app that uses TanStack Query and colocated `styles.ts` files.

---

## Derive, Don't Store

```tsx
// BAD: copying query data into state to filter it
const { data: findings = [] } = useFindings(reviewId);
const [visible, setVisible] = useState<FindingRecord[]>([]);
useEffect(() => {
  setVisible(findings.filter((f) => selected.includes(f.severity)));
}, [findings, selected]);

// GOOD: derive during render (memoize only if the list is large and measured slow)
const { data: findings = [] } = useFindings(reviewId);
const visible = findings.filter((f) => selected.includes(f.severity));
```

---

## Memoization

```tsx
// BAD: memoizing trivial work
const title = useMemo(() => `${repo.owner}/${repo.name}`, [repo]);
const onOpen = useCallback(() => setOpen(true), []); // passed to a plain <button>

// GOOD: memoize only expensive work or identity that a memo child / hook depends on
const grouped = useMemo(() => groupFindingsByFile(findings), [findings]); // hundreds of findings
```

---

## Render Factories

```tsx
// BAD: render factory (camelCase, called as a function)
const renderFinding = (f: FindingRecord) => <div style={s.card}>{f.title}</div>;
return <div>{findings.map(renderFinding)}</div>;

// GOOD: a component
function FindingRow({ finding }: { finding: FindingRecord }) {
  return <div style={s.card}>{finding.title}</div>;
}
return <div>{findings.map((f) => <FindingRow key={f.id} finding={f} />)}</div>;
```

---

## Inline Creation in JSX

```tsx
// Static options: module-level constant (always fine)
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
<SeverityFilter options={SEVERITIES} />;

// Inline object to a plain element: fine, no memo needed
<div style={{ ...s.card, borderLeftColor: severityColor(finding.severity) }} />;

// Inline callback to a React.memo child: stabilize it
const MemoDiff = React.memo(DiffView);
const onLineClick = useCallback((line: number) => setActiveLine(line), []);
<MemoDiff file={file} onLineClick={onLineClick} />;
```

---

## Styling with styles.ts

```tsx
// styles.ts — colocated, typed, static
import type { CSSProperties } from "react";

export const s = {
  card: { padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftStyle: "solid" } satisfies CSSProperties,
  title: { fontWeight: 600 } satisfies CSSProperties,
} as const;

// FindingCard.tsx
import { s } from "./styles";
<div style={{ ...s.card, borderLeftColor: color }}>
  <span style={s.title}>{finding.title}</span>
</div>;

// BAD: shorthand + one side in the same style — React warns when the value changes
const bad = { borderColor: border, borderLeftColor: accent } satisfies CSSProperties;
// GOOD: per-side longhands
const good = { borderTopColor: border, borderRightColor: border, borderBottomColor: border, borderLeftColor: accent };
```

---

## Container / Presenter Split

```tsx
// BAD: the list both loads data and renders 150 lines of markup
function RunsList({ pullId }: { pullId: string }) {
  const { data, isLoading, error } = useRuns(pullId);
  // ...loading, error, empty and all row markup in one component
}

// GOOD: the view owns the data states, the presenter renders
function RunsPanel({ pullId }: { pullId: string }) {
  const t = useTranslations("prReview");
  const { data: runs, isLoading, error } = useRuns(pullId);
  if (isLoading) return <Spinner />;
  if (error) return <InlineError message={t("runs.loadFailed")} />;
  if (!runs?.length) return <EmptyState text={t("runs.empty")} />;
  return <RunsTable runs={runs} />;
}
```

---

## State Colocation

```tsx
// BAD: search text lifted to the page re-renders the whole PR view on each keystroke
function PullPage() {
  const [query, setQuery] = useState("");
  return (
    <>
      <FileSearch value={query} onChange={setQuery} />
      <DiffViewer />
      <FindingsPanel />
    </>
  );
}

// GOOD: the search owns its state; share it through the URL only if other parts need it
function PullPage() {
  return (
    <>
      <FileSearchSection />
      <DiffViewer />
      <FindingsPanel />
    </>
  );
}
```

---

## Data Fetching in Hooks

```tsx
// BAD: fetching in a component
function AgentEditor({ id }: { id: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  useEffect(() => {
    apiFetch<Agent>(`/agents/${id}`).then(setAgent);
  }, [id]);
}

// GOOD: a query hook from the domain's api layer
// features/agents/api/get-agent.ts
export const agentQueryOptions = (id: string) =>
  queryOptions({ queryKey: agentKeys.detail(id), queryFn: ({ signal }) => apiFetch<Agent>(`/agents/${id}`, { signal }) });
export const useAgent = (id: string) => useQuery(agentQueryOptions(id));

// AgentEditor.tsx
const { data: agent, isLoading } = useAgent(id);
```

---

## useEffect Misuse

```tsx
// BAD: effect as an event handler
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (submitted) {
    createAgent.mutate(form);
    setSubmitted(false);
  }
}, [submitted]);

// GOOD: logic in the handler; the mutation hook invalidates queries and errors are toasted globally
const createAgent = useCreateAgent();
const onSubmit = () =>
  createAgent.mutate(form, { onSuccess: (agent) => router.push(`/agents/${agent.id}`) });
```

---

## Early Returns for States

```tsx
// BAD: nested ternaries
return isLoading ? <Spinner /> : error ? <InlineError /> : data?.length ? <List items={data} /> : <EmptyState />;

// GOOD: early returns
if (isLoading) return <Spinner />;
if (error) return <InlineError message={t("loadFailed")} />;
if (!data?.length) return <EmptyState text={t("empty")} />;
return <List items={data} />;
```

---

## Route Errors (Next.js)

```tsx
// app/repos/[repoId]/pulls/[number]/error.tsx — catches render errors of this segment only
"use client";

export default function PullError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <div role="alert">
      <p>{t("somethingWentWrong")}</p>
      <Button onClick={reset}>{t("tryAgain")}</Button>
    </div>
  );
}
```

---

## Key Prop Patterns

```tsx
// BAD: index as key — focus and expanded state jump when the severity filter changes
{visible.map((f, i) => <FindingCard key={i} finding={f} />)}

// GOOD: stable id
{visible.map((f) => <FindingCard key={f.id} finding={f} />)}

// GOOD: key on the Fragment
{stats.map((row) => (
  <React.Fragment key={row.label}>
    <dt>{row.label}</dt>
    <dd>{row.value}</dd>
  </React.Fragment>
))}
```

---

## Conditional Rendering Gotcha

```tsx
// BAD: renders "0" when there are no critical findings
{criticalCount && <Badge>{criticalCount}</Badge>}

// GOOD
{criticalCount > 0 && <Badge>{criticalCount}</Badge>}
```

---

## Accessibility

```tsx
// BAD: icon-only button without a label
<button onClick={onDismiss}><XIcon /></button>

// GOOD
<button onClick={onDismiss} aria-label={t("finding.dismiss")}><XIcon /></button>

// GOOD: announce run status changes
<div aria-live="polite">{t("run.status", { status: run.status })}</div>

// GOOD: shortcuts ignore typing in inputs
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "j") focusNext();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [focusNext]);
```

---

## Lazy-loading Heavy Client Libraries

```tsx
// BAD: mermaid in the main bundle of every page that imports the component
import mermaid from "mermaid";

// GOOD: load it only where it renders
const MermaidDiagram = dynamic(() => import("@/components/mermaid-diagram"), { ssr: false });
```

---

## React 19: ref as Prop

```tsx
// OLD (React 18): forwardRef boilerplate
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => <input ref={ref} {...props} />);

// NEW (React 19): ref is a regular prop
function Input({ ref, ...props }: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

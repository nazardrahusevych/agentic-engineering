# Business logic and the data layer

## Contents
- The four layers
- API layer per domain
- Query key factory and queryOptions
- Business rules in `model/`
- View-model hooks
- State by kind
- Context
- When not to add layers
- Anti-patterns

## The four layers

```
component  →  hook (view model)  →  model (business rules)
                     ↓
                    api (requests, mapping, cache contract)  →  lib/api-client
```

| Layer | Lives in | Does | Does not |
|---|---|---|---|
| Component | `_components/`, `features/*/components/`, `components/` | Render props and hook results, forward user events | Fetch, map API data, compute business rules |
| Hook (view model) | Component folder or `features/*/hooks/` | Combine data hooks, UI state, URL state; expose what the view renders and the handlers it calls | Hold raw `fetch` calls or JSX |
| Model | `features/*/model/` | Business rules as pure functions/classes: decisions, calculations, invariants, domain types | Import React, read env, perform I/O |
| API | `features/*/api/` | Call the API client, validate and map responses to domain types, define query keys/options and query/mutation hooks | Render UI; leak response shapes past itself |

Dependencies point down only: components may use hooks and model; hooks may use api and model; api may use model
types and `lib/`; model depends on nothing but other model code and shared `utils/`/`types/`.

Why: rules in `model/` are tested with plain unit tests and reused by any screen; API shape changes stay inside
`api/`; components stay readable and easy to restyle.

## API layer per domain

```
features/reviews/api/
├── review-queries.ts   # query key factory (+ shared queryOptions) — the cache contract, universal
├── review-dto.ts       # response schema / DTO type and toReview() mapper
├── get-review.ts       # request fn + queryOptions + useReview()
├── list-reviews.ts     # request fn + queryOptions + useReviews(filters)
└── run-review.ts       # mutation fn + useRunReview() with invalidation
```

```ts
// features/reviews/api/get-review.ts
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Review } from "../types";
import { reviewDtoSchema, toReview } from "./review-dto";
import { reviewKeys } from "./review-queries";

export async function getReview(reviewId: string): Promise<Review> {
  const dto = reviewDtoSchema.parse(await apiClient.get(`/reviews/${reviewId}`));
  return toReview(dto);
}

export const reviewQueryOptions = (reviewId: string) =>
  queryOptions({ queryKey: reviewKeys.detail(reviewId), queryFn: () => getReview(reviewId) });

export function useReview(reviewId: string) {
  return useQuery(reviewQueryOptions(reviewId));
}
```

```ts
// features/reviews/api/run-review.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { reviewKeys } from "./review-queries";

export function runReview(input: { reviewId: string; agentId: string }) {
  return apiClient.post(`/reviews/${input.reviewId}/runs`, { agentId: input.agentId });
}

export function useRunReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runReview,
    onSuccess: (_run, input) => queryClient.invalidateQueries({ queryKey: reviewKeys.detail(input.reviewId) }),
  });
}
```

Rules of thumb:

- **One configured client** in `lib/api-client.ts` (base URL, headers, error type). Request functions use it; nothing
  else calls `fetch` for app data.
- **Request functions return domain types.** Validate (schema) and map the response at the edge so components never
  see the wire shape. If the API contract comes from a shared typed package and already fits the UI, re-export it and
  skip the mapper; add one when shapes diverge.
- **One file per operation** keeps each request, its options and its hook together; a tiny domain may hold all of
  them in one `review-api.ts`.
- **Hooks are thin.** Business decisions about the data belong in `model/` or a view-model hook, not in `queryFn`.

## Query key factory and queryOptions

```ts
// features/reviews/api/review-queries.ts — universal: no server-only, no client-only imports
import type { ReviewFilters } from "../types";

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  list: (filters: ReviewFilters) => [...reviewKeys.lists(), filters] as const,
  details: () => [...reviewKeys.all, "detail"] as const,
  detail: (reviewId: string) => [...reviewKeys.details(), reviewId] as const,
};
```

- One factory per domain, colocated with its requests. No global `queryKeys.ts` for the whole app.
- Hierarchical keys let mutations invalidate broadly (`reviewKeys.lists()`) or narrowly (`reviewKeys.detail(id)`).
- Every variable the `queryFn` uses is part of the key.
- `queryOptions` objects are the unit of reuse: the same object serves `useQuery`, `useSuspenseQuery`,
  `prefetchQuery` in a Server Component and `ensureQueryData` in a loader.
- Server state stays in the query cache. Don't copy query data into `useState`; derive from it.

## Business rules in `model/`

```ts
// features/reviews/model/verdict.ts
import type { Finding, Verdict } from "../types";

const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

export function getVerdict(findings: Finding[]): Verdict {
  if (findings.some((f) => BLOCKING_SEVERITIES.has(f.severity))) return "request-changes";
  return findings.length > 0 ? "comment" : "approve";
}
```

- Pure functions (or small classes) with domain names; unit tested without rendering.
- Variations by type (provider, plan, country) become a lookup of strategy objects in `model/`, not `if` chains
  repeated across components.
- If the same rule must hold on the server too, keep it in a universal module so both sides import one copy.
- A rule change that edits many components is a sign the rule was never in `model/`.

## View-model hooks

```ts
// features/reviews/hooks/use-review-page.ts
export function useReviewPage(reviewId: string) {
  const review = useReview(reviewId);
  const [severity, setSeverity] = useSeverityParam();          // URL state
  const visible = review.data ? filterBySeverity(review.data.findings, severity) : [];
  return { review, visible, verdict: review.data && getVerdict(review.data.findings), severity, setSeverity };
}
```

- Colocate it with the view when only that view uses it; move to `features/<domain>/hooks/` when 2+ views do.
- Name it after the use case (`useReviewPage`, `useRunPolling`), not after React lifecycles (`useMount`).
- Only functions that call hooks are hooks. A pure function used by a hook is a helper or a `model/` rule.

## State by kind

| Kind | Home | Notes |
|---|---|---|
| Local UI state (open, hovered, draft input) | `useState`/`useReducer` in the component that needs it | Lift only to the closest common owner |
| URL state (filters, tab, sort, page) | Search params / route segments | Shareable, survives reload; read via a small hook |
| Server cache | Query library via `features/*/api` hooks | Never mirrored into local or global state |
| Form state | Form library or controlled state in the form component; schema next to the form or in `model/` | Submit through a mutation hook or Server Action |
| Global UI state (theme, toasts, command palette) | Context or a small store in `lib/` or `app/providers.tsx` | Keep it small; not for server data |
| Domain session state (current workspace/repo) | Context in the owning feature, provided by the route/layout | Prefer the URL when the value is navigable |

## Context

Context is dependency injection for values many components read (theme, current workspace, feature flags). Split
contexts by concern, keep the provider close to its consumers, and don't use it as a cache for server data.

## When not to add layers

- A screen that shows one query and has no rules needs a request + hook in `api/` and a component. No `model/`, no
  view-model hook.
- Don't wrap a plain request in a "use case" or "service" class.
- Add `model/` when a rule appears in two places or needs tests; add a view-model hook when a component's logic
  outgrows its JSX.

## Anti-patterns

- `useEffect(() => { fetch(...).then(setData) }, [])` inside a component.
- `queryKey: ["review", id]` string literals scattered across components instead of a key factory.
- Business conditions inline in JSX (`{run.status === "done" && findings.some(...) && !run.retried && …}`).
- API response shapes (`dto.attributes.x`) used in components.
- One global `hooks/` folder with every domain's query hooks behind an `export *` barrel.
- A context or store holding a copy of server data.

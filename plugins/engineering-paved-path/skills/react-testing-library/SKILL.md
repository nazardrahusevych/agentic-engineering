---
name: react-testing-library
description: "React Testing Library + Vitest guide for React / Next.js apps. Use when writing, reviewing, or fixing React component and hook tests. Covers what to test, the Vitest/jsdom setup, providers (next-intl, TanStack Query), mocking the domain API hooks and next/navigation, query priority, userEvent, async patterns and common anti-patterns."
---

# React Testing Library

Guide for testing React components and hooks with React Testing Library (RTL) and Vitest.

## Assumed stack

Versions and conventions are examples — adapt to your project (check its CLAUDE.md / AGENTS.md, if any).

- **Vitest 2 + jsdom**, a `vitest.config.ts` with the app's path aliases (e.g. `@`), `globals: true`, `css: false`,
  and a setup file (e.g. `src/test/setup.ts`: jest-dom matchers, `ResizeObserver` stub).
- `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. Browser flows belong in a
  separate end-to-end suite (e.g. Playwright), not here.
- Run: `vitest run` (all), `vitest run <path>` (one file), plus the project's typecheck.
- What deserves a test follows the project's testing guide (if any); prefer the core user-facing surfaces over
  coverage numbers.

## Philosophy: Fewer Tests, Real Scenarios

> "Write tests. Not too many. Mostly integration." — Kent C. Dodds

1. **Use-case coverage > code coverage** — think about what the user can DO, not what the code does internally.
2. **Write fewer, longer tests** — one test that walks through a flow beats six isolated assertions.
3. **Test behavior, not implementation** — assert on what the user sees and can do; never on internal state,
   render counts or DOM structure.
4. **Mock at the boundary** — when a separate API owns the data, the network boundary of a component is its
   **domain API hooks** (`features/<domain>/api`), or the network itself if the project uses MSW. Mock that module; never mock your own presentational
   components or context internals.
5. **Each test must justify its existence** — if removing it wouldn't reduce confidence, delete it.

---

## Test Scenarios by Component Type

Write **1–3 tests per component**, each a full user flow.

### Form / editor (e.g. AgentEditor, settings forms)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Fill → save → mutation called with the right input** | typing, validation passing, the mutation hook call |
| 2 | **Invalid input → inline errors, save disabled or blocked** | validation rules, error rendering |
| 3 | **Mutation pending/failed → button state / error text** | pending UI, error state from the hook |

### List / panel (e.g. FindingsPanel, runs list, PR list)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Data renders → user filters or selects → list updates** | rendering, interaction, derived state |
| 2 | **Empty state** | zero-data handling |
| 3 | **Error / loading state** | hook returns `isLoading` / `error` |

### Presentational (e.g. FindingCard, RunCostBadge)

| # | Test | What it covers |
|---|------|----------------|
| 1 | **Renders props and handles interaction** | props → UI, callbacks |
| 2 | **Meaningful branches only** (missing cost → fallback text) | conditional rendering |

---

## Complete Spec Template

```tsx
// app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@/lib/types"; // the contract type
import messages from "@/../messages/en/prReview.json";
import { FindingsPanel } from "./FindingsPanel";

// Boundary: the domain API hooks this component calls
const mutate = vi.fn();
vi.mock("@/features/reviews/api", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

const renderPanel = (findings: FindingRecord[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPanel findings={findings} prId="pr1" />
    </NextIntlClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("FindingsPanel", () => {
  it("filters by severity and dismisses a finding", async () => {
    const user = userEvent.setup();
    renderPanel(FINDINGS);

    await user.click(screen.getByRole("button", { name: /warning/i })); // toggle a severity chip off
    expect(screen.queryByText("Unused import")).not.toBeInTheDocument();

    const card = screen.getByRole("article", { name: /hardcoded secret/i });
    await user.click(within(card).getByRole("button", { name: /dismiss/i }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ findingId: "f1" }));
  });

  it("shows the empty state when nothing matches", () => {
    renderPanel([]);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
```

(Fixture data and accessible names are illustrative; use the component's real labels from the messages file.)

---

## Import Rules

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"; // never from jest
import { render, screen, waitFor, within, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event"; // always userEvent, never fireEvent
```

- Import app code through the `@/` alias, not `../../../../../../lib/...`.
- Messages: import the namespace JSON the component uses and pass it as `{ <namespace>: messages }`.

---

## Providers

| Component uses | Wrap / mock with |
|---|---|
| `useTranslations` | `<NextIntlClientProvider locale="en" messages={{ ns: messages }}>` |
| a domain API hook | `vi.mock()` of that hooks module (preferred), or a real `QueryClientProvider` with a fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })` when the test needs real query behavior |
| `useRouter`, `useSearchParams`, `usePathname`, `useParams` | `vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }), useSearchParams: () => new URLSearchParams("tab=findings"), usePathname: () => "/repos/r1/pulls/1", useParams: () => ({ repoId: "r1", number: "1" }) }))` |
| theme / repo context | render the real provider from `lib/` with controlled props |

Create one local `renderX()` helper per test file; promote it to `src/test/` only when a second file needs the same
wrapper.

---

## Query Priority

### Tier 1 — Accessible (default choice)

| Query | Use For |
|-------|---------|
| `getByRole` | Buttons, links, headings, inputs, checkboxes, tabs, dialogs — **always try first** |
| `getByLabelText` | Form fields with a `<label>` |
| `getByPlaceholderText` | Inputs without a label (prefer adding a label instead) |
| `getByText` | Static text content — paragraphs, spans, messages |
| `getByDisplayValue` | Input with a current value |

### Tier 2 — Semantic

| Query | Use For |
|-------|---------|
| `getByAltText` | Images |
| `getByTitle` | Elements with `title` attribute |

### Tier 3 — Last resort

| Query | Use For |
|-------|---------|
| `getByTestId` | Only when no accessible query works (e.g. a canvas chart); requires `data-testid` |

### Query Variants

| Variant | Returns | Use When |
|---------|---------|----------|
| `getBy` | Element or throws | Element **must** be present |
| `queryBy` | Element or `null` | Asserting element does **not** exist |
| `findBy` | Promise\<Element\> | Element appears **after** an async operation |
| `*AllBy` | Array variants | Multiple matching elements |

### Role Query Patterns

```
getByRole('button', { name: /save/i })
getByRole('heading', { level: 2 })
getByRole('textbox', { name: /system prompt/i })
getByRole('tab', { name: /findings/i })
getByRole('checkbox', { name: /hide low confidence/i })
getByRole('combobox')              // <select>
getByRole('status') / getByRole('alert')
getByRole('dialog')
```

If the only way to find an element is a test id, the component probably lacks an accessible name — fix that first.

---

## userEvent

Always call `userEvent.setup()` before rendering. All methods are async.

| Method | Purpose |
|--------|---------|
| `user.click(el)` | Click |
| `user.type(el, 'text')` | Type text (appends to existing value) |
| `user.clear(el)` | Clear input value |
| `user.selectOptions(el, 'value')` | Select dropdown option |
| `user.tab()` | Tab to next focusable element |
| `user.keyboard('{Enter}')` / `user.keyboard('j')` | Press keys (shortcuts like j/k) |
| `user.hover(el)` / `user.unhover(el)` | Mouse hover |

```tsx
const user = userEvent.setup();
renderEditor();
await user.click(screen.getByRole("button", { name: /save/i }));
```

---

## Async Testing

- `findBy*` for an element that appears after async work; `waitFor` for multi-assertion conditions;
  `waitForElementToBeRemoved` for disappearing spinners.
- **Never** use `setTimeout` or fixed delays.
- **Never** wrap RTL calls in `act()` — RTL does it; use `act` only around direct state changes in `renderHook`.
- Timers (debounce, polling): `vi.useFakeTimers({ shouldAdvanceTime: true })` with
  `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`; restore with `vi.useRealTimers()` in `afterEach`.

---

## Hook Testing

Use `renderHook` only for hooks with **complex pure logic** (filter/sort state, keyboard navigation). Data hooks are
thin wrappers over TanStack Query; test them through the component, or with a real `QueryClientProvider` wrapper and
a mocked `apiFetch` when the query-key/invalidation behavior itself is the point.

```tsx
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const { result } = renderHook(() => useSeverityFilter(FINDINGS), { wrapper });
```

---

## What to Test / What to Skip

**Test:** user flows on the app's core surfaces and editors; loading → loaded → interaction; empty and error
states; conditional UI that changes behavior (fallbacks for missing stored fields such as run cost).

**Skip:** internal state, hook call counts other than the boundary mutation, CSS / inline style values, design-system
internals, snapshots, constants, Next.js routing itself (covered by the end-to-end suite).

---

## Test File Conventions

- Place tests next to the component: `_components/<Name>/<Name>.test.tsx`; tests for `lib/` or `utils/` next to
  the file (`cost.test.ts`).
- `.test.tsx` / `.test.ts` (not `.spec`); one `describe` per component or hook.
- Test names describe user-visible behavior: `"filters by severity and dismisses a finding"`.
- Always use `screen` — never destructure queries from `render()`.
- `vi.clearAllMocks()` in `beforeEach` when mocks are shared across tests.

---

## Anti-Patterns

| Anti-Pattern | Fix |
|-------------|-----|
| `fireEvent.click()` (common in older tests) | `await user.click()` from `userEvent.setup()` |
| `getByTestId` as first choice | `getByRole`, `getByLabelText`, `getByText` first |
| Deep relative imports `../../../../../../lib/hooks/x` | `@/lib/hooks/x` |
| Mocking `fetch`/`apiFetch` for a component test | mock the domain API hooks module |
| Mocking your own child components | render them; mock only the boundary |
| Many tiny tests with one assertion each | fewer flow tests |
| Testing `useState` / hook internals | test the rendered output |
| `setTimeout` / fixed delays | `findBy` / `waitFor` |
| Snapshot tests replacing behavior tests | explicit assertions |
| `container.querySelector()` | RTL queries |
| Shared mutable fixtures between tests | build them per test or reset in `beforeEach` |
| Hardcoded English strings that differ from the messages file | use the real message text or a role + name regex |

Existing tests that still use `fireEvent`, `getByTestId` or deep relative imports are legacy: new tests follow this
guide, old ones are updated when they are rewritten.

---

## jest-dom Matchers Reference

| Matcher | Checks |
|---------|--------|
| `toBeInTheDocument()` | Element is in the DOM |
| `toBeVisible()` | Element is visible to the user |
| `toBeEnabled()` / `toBeDisabled()` | Enabled/disabled state |
| `toHaveTextContent(/text/i)` | Contains text |
| `toHaveValue('val')` | Input/select current value |
| `toHaveAttribute('href', '/path')` | HTML attribute |
| `toBeChecked()` | Checkbox/radio is checked |
| `toHaveFocus()` | Element has focus |
| `toHaveAccessibleDescription()` | `aria-describedby` text |
| `toBeEmptyDOMElement()` | No visible content |

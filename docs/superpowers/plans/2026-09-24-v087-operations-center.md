# v0.87 Operations Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Owner Dashboard open to a dedicated Operations Center that summarizes business health, surfaces actionable work, and provides owner-wide search without changing the existing production workflow.

**Architecture:** Add one server-side operations aggregator that reads the current request, quote, queue, final-invoice, shipment, backup, audit, Stripe, and EasyPost state and converts it into a typed owner-only snapshot. Expose that snapshot through a protected no-store API, render it in a new client component, and add a focus handoff into the existing Production tab so attention/search results can open the correct request card. Keep Production, Site Content, and Security & Backups intact.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite collection store, Railway, Stripe configuration helpers, EasyPost configuration helpers, existing GitHub Actions browser/SQLite integration validation.

**Spec:** `docs/superpowers/specs/2026-09-24-owner-platform-roadmap.md`

## Global Constraints

- Baseline is v0.86, commit `faf05aff4dc4ec965ebb9b0baa5e7f315b1253ed`.
- Release version becomes `0.87.0`.
- GitHub `main` remains source of truth; implementation stays on `feature/v087-operations-center` until validation passes.
- Existing customer/owner session, same-origin, upload, ClamAV, Stripe, EasyPost, backup, and webhook protections must remain unchanged.
- EasyPost unconfigured state is informational while approval/API access is pending, not an urgent business failure.
- No live Stripe/EasyPost mutation is part of this release.
- Mobile breakpoint remains 720px.
- Production SQLite remains on the Railway persistent volume.
- Required release validation: `npm ci`, `npm run lint`, `npm run build`, seeded Operations Center integration checks, and visual inspection at the project responsive widths.

## Review Focus

1. **Old requests with missing newer fields:** operations aggregation must normalize missing quote/invoice/shipment data and never crash the dashboard.
2. **EasyPost still unconfigured:** integration health must show “Waiting for setup”/warning, never an urgent outage.
3. **Stale vs genuinely overdue work:** date-based attention rules must ignore completed/declined work and only flag active records.
4. **Search privacy and correctness:** owner search may include customer contact details because it is owner-only, but must never include secrets, passwords, payment credentials, or private upload contents.
5. **Navigation focus:** clicking an Operations Center item must open the Production tab and expand the exact linked request without losing the current business state.

---

### Task 1: Define Operations Center Types and Attention Rules

**Files:**
- Create: `lib/owner-operations-types.ts`
- Create: `lib/owner-operations.ts`
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes:
  - `StoredRequest[]`
  - `StoredQuote[]`
  - `QueueJob[]`
  - `FinalInvoiceRecord[]`
  - `ShipmentRecord[]`
  - `AuditEntry[]`
  - backup metadata
  - `stripeConfigurationSummary()`
  - `easyPostConfigurationSummary()`
- Produces:
  - `buildOwnerOperationsSnapshot(input: OwnerOperationsInput, now?: Date): OwnerOperationsSnapshot`
  - `OwnerAttentionItem`
  - `OwnerSearchRecord`
  - `OwnerIntegrationHealth`

- [ ] **Step 1: Add a failing seeded operations assertion to CI**

Extend the existing v0.86 seeded SQLite validation in `.github/workflows/validate.yml` with an owner operations fixture containing:
- one new request;
- one sent quote older than 72 hours;
- one deposit-paid request not in queue;
- one Ready job with an open final invoice;
- one shipment with `review_required`;
- a recent backup;
- EasyPost unconfigured.

After owner login, request `GET /api/owner/operations` and assert the route is not yet available:

```bash
OPS_CODE=$(curl -sS -b /tmp/invoice-owner.cookies -o /tmp/operations.json -w "%{http_code}"   http://127.0.0.1:3001/api/owner/operations)
test "$OPS_CODE" = "404"
```

This is the red test before the route and aggregator exist.

- [ ] **Step 2: Create the typed operations model**

Create `lib/owner-operations-types.ts`:

```ts
export type OwnerAttentionSeverity = "urgent" | "action" | "watch";
export type OwnerAttentionCategory =
  | "request"
  | "quote"
  | "deposit"
  | "production"
  | "invoice"
  | "shipping"
  | "backup"
  | "integration";

export type OwnerAttentionItem = {
  id: string;
  severity: OwnerAttentionSeverity;
  category: OwnerAttentionCategory;
  title: string;
  detail: string;
  requestId: string;
  requestCode: string;
  createdAt: string;
  ageHours: number;
};

export type OwnerSearchRecord = {
  id: string;
  requestId: string;
  requestCode: string;
  customerName: string;
  email: string;
  phone: string;
  queueCode: string;
  queueTitle: string;
  invoiceNumber: string;
  trackingCode: string;
  haystack: string;
};

export type OwnerIntegrationHealth = {
  stripe: { tone: "good" | "warning" | "error"; label: string; detail: string };
  easyPost: { tone: "good" | "warning" | "error"; label: string; detail: string };
  backups: { tone: "good" | "warning" | "error"; label: string; detail: string; latestAt: string };
  recentFailures: { tone: "good" | "warning" | "error"; label: string; detail: string };
};

export type OwnerOperationsSnapshot = {
  generatedAt: string;
  counts: {
    urgent: number;
    action: number;
    watch: number;
    newRequests: number;
    activeProduction: number;
    finalBalancesDue: number;
    completed: number;
  };
  attention: OwnerAttentionItem[];
  search: OwnerSearchRecord[];
  integrations: OwnerIntegrationHealth;
};
```

- [ ] **Step 3: Implement deterministic attention rules**

Create `lib/owner-operations.ts` with a pure exported function:

```ts
export function buildOwnerOperationsSnapshot(input: OwnerOperationsInput, now = new Date()): OwnerOperationsSnapshot
```

Rules:
- `urgent`
  - final invoice status `uncollectible` or `void` while the request is active;
  - final invoice has `paymentFailedAt`;
  - shipment status `failure` or `return_to_sender`;
  - shipment status `review_required`;
  - active production estimated-ready date is before today and job is not Ready/Completed.
- `action`
  - request status `new`;
  - quote status `countered` or `declined` on an otherwise active request;
  - approved quote with outstanding deposit;
  - deposit-paid request with no queue job;
  - Ready job with no final invoice or an unpaid open invoice.
- `watch`
  - sent quote older than 72 hours;
  - open final invoice past due date;
  - most recent complete backup older than 36 hours;
  - recent audit actions containing `failed` within the last 72 hours.
- Ignore declined/completed requests for normal workflow alerts.
- De-duplicate items by stable ID: `<category>:<requestId>:<rule>`.
- Sort urgent before action before watch, then oldest actionable item first.
- Search haystack is lowercase and concatenates request code, name, email, phone, queue code/title, Stripe invoice number, and tracking code.

For EasyPost health:

```ts
const easyPostHealth = shipping.configured
  ? { tone: "good", label: "EasyPost configured", detail: shipping.mode === "test" ? "Test mode" : "Production mode" }
  : { tone: "warning", label: "EasyPost waiting for setup", detail: "API access is still pending; no shipping outage is reported." };
```

- [ ] **Step 4: Replace the temporary 404 assertion with rule assertions**

Update the CI fixture to expect `200` after Tasks 1–2 are implemented later, with the final assertions:

```js
const ops = JSON.parse(fs.readFileSync("/tmp/operations.json","utf8"));
if (ops.snapshot.counts.newRequests < 1) throw new Error("New request count missing");
if (!ops.snapshot.attention.some(x => x.category === "invoice")) throw new Error("Invoice attention missing");
if (!ops.snapshot.attention.some(x => x.category === "shipping")) throw new Error("Shipping attention missing");
if (ops.snapshot.integrations.easyPost.tone !== "warning") throw new Error("Pending EasyPost must be a warning, not an outage");
if (!ops.snapshot.search.some(x => x.requestCode === "MH3D-INVOICE-TEST")) throw new Error("Owner search index missing seeded request");
```

Do not change the expected code to 200 until Task 2 creates the route.

- [ ] **Step 5: Commit**

Commit message:

```text
V0.87 add operations attention model
```

---

### Task 2: Add the Protected Operations Snapshot API

**Files:**
- Create: `app/api/owner/operations/route.ts`
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes:
  - `readRequests()`
  - `readQuotes()`
  - `readQueue()`
  - `readFinalInvoices()`
  - `readShipments()`
  - `readAudit(300)`
  - `listBackups()`
  - `stripeConfigurationSummary()`
  - `easyPostConfigurationSummary()`
  - `buildOwnerOperationsSnapshot(...)`
- Produces:
  - authenticated `GET /api/owner/operations`
  - JSON `{ snapshot: OwnerOperationsSnapshot }`

- [ ] **Step 1: Implement authentication and aggregation**

Create:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";
import { readQueue } from "@/lib/queue-store";
import { readFinalInvoices } from "@/lib/final-invoice-store";
import { readShipments } from "@/lib/shipment-store";
import { readAudit } from "@/lib/audit-log";
import { listBackups } from "@/lib/backups";
import { stripeConfigurationSummary } from "@/lib/stripe-checkout";
import { easyPostConfigurationSummary } from "@/lib/easypost";
import { buildOwnerOperationsSnapshot } from "@/lib/owner-operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const [requests, quotes, queue, invoices, shipments, audit, backups, shipping] =
    await Promise.all([
      readRequests(),
      readQuotes(),
      readQueue(),
      readFinalInvoices(),
      readShipments(),
      readAudit(300),
      listBackups(),
      easyPostConfigurationSummary(),
    ]);

  const snapshot = buildOwnerOperationsSnapshot({
    requests,
    quotes,
    queue,
    invoices,
    shipments,
    audit,
    backups,
    stripe: stripeConfigurationSummary(),
    shipping,
  });

  return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 2: Run the seeded endpoint validation**

Run the GitHub validation workflow and confirm:
- unauthenticated operations endpoint returns 401;
- authenticated endpoint returns 200;
- seeded counts/attention/search assertions pass;
- EasyPost pending state is warning only.

- [ ] **Step 3: Commit**

Commit message:

```text
V0.87 add owner operations API
```

---

### Task 3: Build the Default Operations Center UI

**Files:**
- Create: `components/OwnerOperationsCenter.tsx`
- Modify: `components/OwnerQueueManager.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/owner/operations`
  - `OwnerOperationsSnapshot`
- Produces:
  - `OwnerOperationsCenter({ onOpenRequest, onNotice })`
  - `onOpenRequest(requestId: string): void`

- [ ] **Step 1: Add a failing browser assertion**

Before creating the component, extend the owner browser validation to assert the default owner body contains `OPERATIONS CENTER`. It must fail on the current Production-default UI.

- [ ] **Step 2: Create the Operations Center component**

The component must:
- fetch `/api/owner/operations` on mount and Refresh;
- show a top greeting/summary section headed `Operations Center`;
- render KPI cards for Urgent, Needs action, Watching, New requests, Active production, Final balances due, Completed;
- render “Needs Attention” with severity chips and category labels;
- render “System Health” cards for Stripe, EasyPost, Backups, Recent failures;
- render a global search input;
- filter `snapshot.search` client-side with:

```ts
const normalized = query.trim().toLowerCase();
const results = normalized
  ? snapshot.search.filter((item) => item.haystack.includes(normalized)).slice(0, 12)
  : [];
```

Each actionable item uses:

```tsx
<button type="button" onClick={() => item.requestId && onOpenRequest(item.requestId)}>
  ...
</button>
```

Backup/integration items without a request ID stay non-clickable.

- [ ] **Step 3: Make Operations the default owner tab**

Change:

```ts
type OwnerTab = "operations" | "production" | "site" | "security";
```

and initialize:

```ts
const [tab, setTab] = useState<OwnerTab>("operations");
const [focusedRequestId, setFocusedRequestId] = useState("");
```

Add the first toolbar tab:

```tsx
<button className={tab==="operations"?"is-active":""} onClick={()=>setTab("operations")} type="button">
  Dashboard
</button>
```

Render:

```tsx
{tab==="operations" && (
  <OwnerOperationsCenter
    onNotice={setNotice}
    onOpenRequest={(requestId) => {
      setFocusedRequestId(requestId);
      setTab("production");
    }}
  />
)}
```

- [ ] **Step 4: Add focus handoff to Production**

Extend `ProductionPanel` with `focusedRequestId` and `onFocusedRequestHandled`.

Extend `CombinedRequestCard` with `forceOpen:boolean`.

Use:

```ts
useEffect(() => {
  if (forceOpen) setOpen(true);
}, [forceOpen]);
```

and attach:

```tsx
id={`owner-request-${request.id}`}
```

After switching to Production, scroll the focused card into view:

```ts
useEffect(() => {
  if (!focusedRequestId) return;
  const timer = window.setTimeout(() => {
    document.getElementById(`owner-request-${focusedRequestId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    onFocusedRequestHandled();
  }, 120);
  return () => window.clearTimeout(timer);
}, [focusedRequestId, onFocusedRequestHandled]);
```

The callback only clears the focus ID after the card receives the open state.

- [ ] **Step 5: Re-run the browser assertion**

The owner page must now:
- default to Operations Center;
- show KPI cards;
- show the seeded Ready/final-balance attention item;
- search `MH3D-INVOICE-TEST`;
- click the search result;
- switch to Production;
- expand and scroll the seeded request card.

- [ ] **Step 6: Commit**

Commit message:

```text
V0.87 make Operations Center the owner landing view
```

---

### Task 4: Responsive Visual Polish

**Files:**
- Modify: `app/globals.css`
- Modify: `.github/workflows/validate.yml`

**Interfaces:**
- Consumes: Operations Center markup/classes.
- Produces: responsive dashboard layout with no horizontal overflow.

- [ ] **Step 1: Add dashboard layout styles**

Add dedicated classes:
- `.owner-operations`
- `.operations-hero`
- `.operations-kpi-grid`
- `.operations-kpi-card`
- `.operations-layout`
- `.operations-attention-list`
- `.operations-attention-item`
- `.operations-health-grid`
- `.operations-health-card`
- `.operations-search`
- `.operations-search-results`

Desktop behavior:
- KPI grid uses `repeat(7, minmax(120px, 1fr))` where space permits.
- main operations body uses a wider Needs Attention column and narrower System Health column.
- ultra-wide owner container remains bounded by the existing v0.85 owner max width.

Tablet:
- 721–1100px uses 3–4 KPI columns and one-column operations body.

Mobile:
- <=720px uses 2 KPI columns;
- <=430px uses 1 KPI column;
- attention/search buttons remain at least 44px tall;
- no horizontal scrolling.

Severity styling:
- urgent = restrained red/danger accent;
- action = amber accent;
- watch = cyan/teal accent;
- system good = green/teal;
- warning = amber;
- error = red.

- [ ] **Step 2: Extend responsive screenshot coverage**

Capture the Operations Center at:
- 320
- 390
- 430
- 650
- 720
- 721
- 1024
- 1440
- 1920
- 2560
- 3440

Add an automated horizontal-overflow check for `/owner` after authenticated browser login at the same widths.

- [ ] **Step 3: Visually inspect**

Check:
- no clipped KPIs;
- no horizontal overflow;
- long customer names and request codes wrap safely;
- search results do not cover toolbar controls;
- attention rows remain easy to tap on mobile;
- health cards do not stretch awkwardly on ultrawide monitors;
- Production focus handoff does not leave a sticky header covering the expanded request.

- [ ] **Step 4: Commit**

Commit message:

```text
V0.87 polish Operations Center responsiveness
```

---

### Task 5: Version, Regression Validation, Review, Merge, Deploy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Review all changed v0.87 files.

**Interfaces:**
- Produces release `0.87.0`.

- [ ] **Step 1: Bump the version**

Set both package files from:

```json
"version": "0.86.0"
```

to:

```json
"version": "0.87.0"
```

- [ ] **Step 2: Run the full validation suite**

Required successful checks:
- `npm ci`
- `npm run lint`
- `npm run build`
- existing registration/origin/upload/3MF checks;
- existing Stripe final-invoice checks;
- new Operations Center seeded attention rules;
- owner Operations Center browser interaction;
- owner responsive overflow matrix;
- screenshot artifact generation.

- [ ] **Step 3: Request code review**

Review focus:
- attention-rule false positives/duplicates;
- owner-only data exposure;
- stale legacy records;
- missing invoice/shipment associations;
- focus-navigation race conditions;
- EasyPost pending state severity;
- date/timezone behavior for overdue logic.

Any material issue found must be fixed and the full relevant validation re-run.

- [ ] **Step 4: Create and review the PR**

PR title:

```text
V0.87 add Owner Operations Center
```

PR body must summarize:
- default Operations Center;
- Needs Attention rules;
- owner-wide search;
- integration/backup health;
- Production focus handoff;
- responsive validation;
- no live payment/shipping mutations.

- [ ] **Step 5: Merge only after green validation**

Use squash merge into `main`.

- [ ] **Step 6: Verify Railway production deployment**

Poll Railway until the new deployment reaches terminal `SUCCESS`. Do not report it live during BUILDING/DEPLOYING.

Then check:
- application starts as `mesh-harbor-3d@0.87.0`;
- `/api/health` is healthy where accessible;
- no new runtime HTTP 500s;
- no new fatal errors;
- persistent `/data` volume remains attached;
- existing ClamAV `clamd.conf` warning remains non-blocking if unchanged.

- [ ] **Step 7: Report the release**

Report:
- changed files;
- tests;
- PR;
- merge commit;
- Railway deployment ID/status;
- any remaining issues;
- that v0.88 Owner Security is the next planned release.

## Self-Review

- Spec coverage: v0.87 requirements from the roadmap are mapped to Tasks 1–4; release/deployment workflow is Task 5.
- Placeholder scan: no TBD/TODO/“implement later” instructions remain.
- Type consistency: `OwnerOperationsSnapshot`, `OwnerAttentionItem`, and `OwnerSearchRecord` are defined once in Task 1 and consumed by Tasks 2–4.
- Review Focus coverage:
  - legacy missing fields: Task 1 seeded/normalization tests;
  - EasyPost pending: Task 1 explicit warning assertion;
  - overdue filtering: Task 1 date rules and completed/declined exclusions;
  - privacy: Task 3 owner-only route/UI and Task 5 review;
  - focus navigation: Task 3 browser interaction check.

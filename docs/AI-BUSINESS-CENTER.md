# AI Business Control Center

Open `/owner`, sign in using the existing owner password/2FA, then follow **Open AI Business Control Center** to `/owner/business`. Page access and every API read/mutation use the existing owner session generation. Mutations also use the existing same-origin policy. This adds no new credentials or production integrations.

## What works

- Mesh Harbor operations-review and lead/customer outreach drafts.
- Independent digital-product ideas and listing drafts, with a rights/license/accuracy checklist.
- Durable queue, idempotent submissions, agent activity, separate spending and draft approvals.
- UTC calendar-month limits in USD cents for the workspace, each business engine and each agent role within that business.
- Existing business-record counts, recent request statuses, recorded payments, and the existing profitability calculation. No customer passwords, email addresses, or descriptions are returned by this adapter.
- Free local templates by default. Optional OpenAI non-reasoning mini models. `DraftProvider` in `provider.ts` is the extension point for later providers; unsupported providers/models are rejected.
- A manual **Process one eligible task** button and an optional standalone worker. No scheduler is registered in application startup.
- Clickable business/project sections, leader/research/design/listing role queues, ten-second visible-page status refresh, and an owner action list.
- Owner ideas, sourced market observations, immutable STL files/hashes, physical test history, failure feedback, revision-specific release gates and private catalog/cart previews.
- A free original parametric tray prototype generator. Uploaded STLs are limited to 1 MB and 20,000 triangles. Each project supports at most 20 revisions and 50 observations; files remain in the private sidecar, never public storage.

## Setup

Use Node 22.18+ (Node 24 recommended for local development), `npm ci`, and `npm run dev`. Existing `OWNER_PASSWORD`, `OWNER_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, and `DATABASE_PATH` keep their documented meaning. Production requires the existing strong credentials and HTTPS origin. Do not use production credentials or a production database for local testing.

| Variable | Default / purpose |
|---|---|
| `AI_CENTER_DATABASE_PATH` | Separate `ai-business-center.sqlite` beside the business database. Must be distinct from `DATABASE_PATH`. Use a persistent writable directory. |
| `AI_CENTER_MONTHLY_LIMIT_CENTS` | Initial global monthly budget, `2500` ($25). Saved dashboard settings take precedence. $25–$50 is the initial experiment range, configurable. |
| `AI_CENTER_OPENAI_API_KEY` | Optional server-only API key; no key required for templates. No credentials are stored in job/settings records. |
| `AI_CENTER_WORKER_ENABLED` | `false`; set `true` only when deliberately starting a background worker with `--watch`. |
| `AI_CENTER_COORDINATOR_ENABLED` | `false`; optional project-stage delegation when running the standalone worker. Queues at most one new job per tick; never grants spending/test/release approval. |

Per-agent initial limits are $10 each. Enable paid AI in the dashboard only after configuring a key and verifying input/output prices against the provider account. Prices in the dashboard are USD per million tokens. There is no assumed default paid price. Models initially supported: `gpt-4.1-mini` and `gpt-4o-mini`; unknown or reasoning models require a reviewed adapter/budget policy first. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) and [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) describe the request surface used here.

For a standalone worker, explicitly pass the same sidecar path and optional API key as the web process:

```text
node --experimental-strip-types scripts/ai-center-worker.mjs
# Continuous mode only with AI_CENTER_WORKER_ENABLED=true:
node --experimental-strip-types scripts/ai-center-worker.mjs --watch
```

The Node loader establishes a server-only entrypoint outside Next; it does not read business records. The worker polls every 30 seconds, processes one job at a time, and logs only IDs/status. The web process can also process a job; SQLite transactions prevent duplicate claims and over-reservation across processes. This requires a shared local SQLite file, not independent containers/volumes. No Railway worker service or scheduler has been created.

## Spending and approval semantics

1. Queue an owner brief. Local templates queue immediately; paid jobs enter the spending inbox.
2. The owner approves the exact brief, provider/model snapshot, token prices, output cap, and calculated maximum cost. Editing settings does not alter existing jobs.
3. On claim, a `BEGIN IMMEDIATE` transaction checks current global/business/role limits and the paid-AI toggle and reserves the full bound before network I/O. Blocked jobs remain queued while other eligible jobs can proceed. UTC month at claim determines the ledger month. Role reservations include uncertain failed calls. A zero role cap prevents paid calls but permits free templates.
4. The provider receives only the owner brief and a fixed drafting instruction. Input is limited to 3,000 characters, output to 128–2,048 tokens, request timeout to 45 seconds, fixed OpenAI endpoint, no tools, no retries, `store:false`. A conservative UTF-8 byte/token bound includes framing overhead. Returned usage computes cost rounded up to cents using the approved prices.
5. Successful drafts enter a second review. Approval changes status to **Ready for manual use**. Rejection does not refund already incurred API usage. There is no send, publish, listing, purchase, payment, or refund command.

A timeout, malformed response, interrupted process, or failed request retains its reservation because billing may be unknown. A running job older than five minutes becomes failed during the next claim. No retry or release occurs automatically. If reported cost exceeds the reserved bound, actual cost is retained and paid AI is disabled. This is an application budget guard, not a guarantee about provider invoices, incorrect prices, taxes, currency conversion, or API activity outside this workspace. Configure provider-side spending controls too. Verify pricing before use. There is no automatic billing reconciliation or reservation-release UI in this MVP.

Do not include personal information, customer addresses, secrets, or confidential business data in briefs. Database content is not automatically included in prompts. Provider text is treated as untrusted and rendered as plain text. Drafts and briefs are private but stored unencrypted in the sidecar; restrict filesystem access and back them up appropriately.

## Financial provenance and limits

The business adapter opens the existing SQLite database with `readOnly:true` and a read transaction. It never initializes, seeds, migrates, or writes business records. Missing/unreadable data is shown as unavailable. Empty existing datasets legitimately produce zero counts; no revenue/sample records are added. Local verification uses isolated synthetic fixtures only.

Recorded net payments aggregate stored quote payments (processor amount where recorded), cash final payments, paid amounts on final invoices, and succeeded quote refunds. These figures are all-time USD records, not reconciled bank balances or net revenue. External marketplace sales, fees, taxes, final-invoice refunds, and missing/legacy records may not be represented. Costed completed-job revenue in the existing cost engine can be snapshot quoted totals or manually recorded historical revenue; it is not a receipt metric. Contribution profit uses available existing cost snapshots/history, excludes uncosted jobs from both costed revenue and contribution profit, and is not net profit. Independent product revenue is unavailable; no sales adapter or market research has been configured.

## Persistence, rollout, and rollback

Railway's current service runs from `main` on one replica with `/data` persistent storage. The review branch cannot trigger its configured production deployment. Do not merge, deploy, enable paid jobs, or start a production worker without explicit owner authorization. There are no changes to existing follow-up automation, checkout, quote mutations, or notification dispatch.

AI tables live only in the sidecar and are lazily created on first authenticated API use. Existing business backups do **not** include it. Back up both files separately using SQLite's backup API or an offline copy with workers/web writes stopped; do not copy only the main file of an active WAL database. Keep sidecar backups access-controlled. Rollback: disable the separate worker/paid toggle and revert this PR; preserve the sidecar for recovery. No business schema rollback is necessary.

## Verification

```text
node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-center.test.mjs
node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-worker.test.mjs
node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-metrics.test.mjs
node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-concurrency.test.mjs
```

`tests/ai-api.integration.mjs` requires `AI_TEST_BASE_URL=http://localhost:<port>` and `AI_TEST_OWNER_PASSWORD` for a running **disposable local** instance with paid AI disabled. It refuses non-local URLs, exercises owner login/API/approvals, and creates only local test drafts. Full live payment/order fulfillment, real production metrics, real provider billing, and deployment are outside these checks.

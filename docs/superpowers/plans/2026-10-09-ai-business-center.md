# AI Business Control Center Implementation Plan

**Goal:** A working owner-only, draft-only MVP with durable jobs and spending controls.
**Architecture:** Reuse owner authentication; isolate AI state in a sidecar SQLite database. Read business records without mutations. Separate policy, persistence, provider, worker, metrics, and UI.
**Tech Stack:** Existing Next.js 16, React 19, TypeScript, Node SQLite, Zod.
**Spec:** ../specs/2026-10-09-ai-business-center.md

## Global constraints
No production changes, deployment, unsolicited outreach, live financial transactions, or credentials changes. Default budget 2500 cents/month; local provider; paid AI disabled. Approval cannot execute external actions.

## Review focus
Concurrent claims and budget reservations; UTC month rollover; unknown provider outcomes; customer-secret exposure; cross-origin owner mutations.

### Task 1: Durable job and budget policy
- [x] Write behavioral tests for defaults, spending approval, exact-once claims, monthly/global/agent caps, rejected/approved drafts and uncertain failures; observe failure.
- [x] Implement `lib/ai-center/{policy,store,types}.ts`; transactional sidecar and immutable job config.
- [x] Run tests with Node 24 and server-only loader; commit.

### Task 2: Draft worker and business adapter
- [x] Test deterministic drafts, fake provider responses/errors with retained reservations, and read-only metrics with synthetic isolated records.
- [x] Implement `provider.ts`, `worker.ts`, `metrics.ts`; bounded calls, no retries/external action capability, no business-data writes.
- [x] Verify tests, document provider pricing and worker recovery limitations; commit.

### Task 3: Owner dashboard and API
- [x] Add `app/owner/business/page.tsx`, `components/AiBusinessCenter.tsx`, `app/api/owner/business/route.ts`; page session gate, API auth/origin checks, validated commands, no-store responses.
- [x] Add owner navigation link, setup/env documentation and CI test step.
- [x] Verify lint/types/build, local HTTP auth/CSRF and dashboard workflow, existing regressions, dependency audit and changed-file security review.
- [x] Prepare a draft PR on `feat/ai-business-control-center`; report limitations truthfully.

## Execution ledger

- Used a fresh checkout and separate branch rather than changing an existing project.
- Paid calls were tested with synthetic responses only; no live AI charges occurred.
- Independent whole-branch review found hidden approvals beyond 200 jobs, declined-active counts, and ambiguous costed-revenue labeling. Added failing regression fixtures, fixed all three, and reran the suite.
- Existing test alias and /tmp paths needed an external Windows portability loader; production source and committed legacy tests were not rewritten. All 44 test files passed.
- Build and TypeScript passed; full lint passed with four existing warnings.
- Local development HTTP and browser workflow passed. An additional local production-mode server launch was rejected by automatic approval review without a detailed reason; production same-origin policy was verified separately in isolation. CI includes the production-build HTTP check, pending its run.
- Existing dependency audit: production dependencies have one critical (Next) and two high findings (sharp, source-map-js); all dependencies have one critical and eight high. No dependency versions changed. Deployment/merge remains a separate human decision.

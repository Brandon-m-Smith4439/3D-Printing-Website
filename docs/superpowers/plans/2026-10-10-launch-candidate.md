# Launch Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish reviewable commerce, research integration and operational readiness without changing production.

**Architecture:** Keep the existing Next application and owner authentication. Add independent persistent SQLite sidecars for commerce and encrypted marketplace state beside the existing database. Run an optional bounded worker in the same container/volume as web, with every external spending/publication gate retained.

**Tech Stack:** Next 16, React 19, Node SQLite, Stripe SDK, Zod, Node process supervisor.

**Spec:** docs/superpowers/specs/2026-10-10-launch-candidate.md

## Global Constraints
- No deployment, paid calls, live checkout or public listing in implementation.
- $25 default total AI monthly cap; existing role/business/current-month reservations remain enforced.
- No product can pass release gates without exact latest-revision owner test evidence.
- Existing quote and fulfillment behavior must pass regression checks.

## Review Focus
- Concurrent stock holds and delayed/mismatched signed payments must not oversell or grant wrong files.
- OAuth replay/cross-session state and hostile API fields must fail without token disclosure.
- Worker startup failure must be visible; stop signals reach both processes with no hidden restart loop.
- New dependencies and public endpoints must not weaken existing owner checks.
- Empty unconfigured stores must show accurate unavailable/empty states, not synthetic sales.

### Task 1: Commerce (delegated, independent files)
- [ ] Implement lib/commerce, app/products, app/stls, app/cart and API/owner UI.
- [ ] Red/green tests for stock holds, signed event invariants and downloads.
- [ ] Root integrates public navigation and owner workspace.

### Task 2: Marketplace (delegated, independent files)
- [ ] Implement lib/marketplace, bounded API routes and MarketplaceConnections.
- [ ] Red/green tests for session-bound PKCE, encrypted tokens, bounded read results.
- [ ] Root integrates UI/background hook and documents registration.

### Task 3: Operations (root)
Files: scripts/start-services.mjs, scripts/service-plan.mjs, tests/service-plan.test.mjs, lib/ai-center/readiness.ts, components/LaunchReadiness.tsx, app/api/owner/business/readiness/route.ts, package.json, .env.example.
- [ ] Test process plan input/disabled-worker behavior, shutdown and readiness redaction.
- [ ] Implement same-container launcher with no automatic retry and read-only setup checklist.
- [ ] Update patchable dependencies, preserving SDK/API compatibility.

### Task 4: Integration/review
- [ ] Run full regressions, build/TypeScript, lint and dependency audit.
- [ ] Run local production-mode HTTP and desktop/mobile QA with isolated fixture data.
- [ ] Review security-sensitive paths, fix verified issues and rerun affected checks.
- [ ] Commit/update draft PR; verify remote tree matches local; attach PR and report limitations.

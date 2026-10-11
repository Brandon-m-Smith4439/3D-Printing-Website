# Product Workflow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and an independent whole-change review.

**Goal:** Provide a working private product project workflow, delegated draft jobs and catalog/cart previews.

**Architecture:** Keep state and assets in the existing AI SQLite sidecar. Reuse owner authentication, origin checks and existing draft spending controls. Store immutable revisions and require versioned owner decisions.

**Tech Stack:** Next.js, React, TypeScript, Node SQLite, Zod; no new dependencies.

**Spec:** ../specs/2026-10-10-product-workflow.md

## Constraints
- No deployment, production writes, public listing, outreach, payment or API spend.
- No fictitious sales data or simulated active agents.
- Owner actions use optimistic version checks; all assets remain private.

## Review focus
- Stale test result cannot approve a new revision.
- Failed re-test/new revision invalidates release package.
- Nonfinite/open/degenerate STL geometry rejected; structural pass never implies physical pass.
- Concurrent delegate clicks reuse one task and keep existing spend gates.
- Owner-only file reads and previews; hostile research URLs never fetched.

## Tasks
1. Add `lib/ai-center/stl.ts` with binary/ASCII validation and parametric tray generation. Write failing `tests/ai-projects.test.mjs`, then pass geometry checks.
2. Add `lib/ai-center/projects.ts` with schemas, state transitions and SQLite assets. Integrate CenterStore atomic project updates/delegation; test stale versions, release invalidation, duplicate jobs and persistent assets.
3. Extend owner API and add private project asset handler, responsive `components/ProductProjects.tsx`, business navigation and private catalog/cart previews. Test access and invalid commands; run regression suite, lint, types and build; document remaining integrations and prepare PR update.

## Execution ledger
- Ruling: Implement private workflow increment before external commerce connections because Etsy authentication, paid API configuration, physical testing and release approval are not available yet.

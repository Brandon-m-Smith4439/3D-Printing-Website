# Slicing, Cost and Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an owner/leader request for a current STL into a visible slice estimate, a full-cost price proposal and a supplies-based packing proposal.

**Architecture:** Add a bounded local-worker queue to the existing AI-center SQLite database. A manually started, paired Windows worker runs the installed Bambu Studio and submits validated estimates. Existing project, sales and catalog-shipping services retain their approval boundaries.

**Tech Stack:** Node >=22.16.0, TypeScript, node:sqlite, node:crypto, node:child_process, Zod, existing Next.js 16.3.8/React 19 application; no additional runtime dependency or paid provider.

**Spec:** `docs/superpowers/specs/2026-10-12-slicing-cost-packing-design.md`

## Global Constraints

- Default profile is X2D, 0.4 mm, 0.20 mm Standard, Black PLA Basic, Textured PEI Plate.
- Outdoor products require PETG; unavailable suitable PETG profile/color blocks readiness rather than falling back to PLA.
- Preserve selected multicolor product intent; require explicit part/region assignments and verified compatible hardware. Never assume AMS ownership.
- Cross-platform dated evidence is accepted; automated web-wide collection is a separate research integration, not an Etsy-only collector renamed.
- One slicer process at a time, a three-minute timeout, at most two automatic attempts.
- No arbitrary profile upload, printer discovery, printer network commands or automatic G-code execution is supported.
- Owner confirms complete contents/weight/dimensions before the existing packed-parcel flow accepts the proposal.
- Keep existing physical-test, release and exact-postage approvals; default AI experimentation cap remains $25/month.
- New estimates and calibrated supplies are distinct from owner actuals; missing inputs stay unknown.
- Keep new integration disabled until pairing/validation; no production deployment, secrets transfer or public release during implementation.
- Read relevant installed Next.js documentation before changing routes or components, per AGENTS.md.

## Review Focus

1. A sleep/disconnect after claiming a task must show worker unavailable and allow bounded lease recovery (Task 1/4).
2. A revoked worker or guessed revision URL must not obtain another asset or submit results (Task 3).
3. A new STL/profile/quantity must not inherit ready pricing or parcel approvals from an older estimate (Task 1/2/5).
4. Low material cost must not imply full profit when overhead, fees or packaging are missing (Task 2).
5. A visually fitting box with insufficient protection or unknown tare must not become an approved parcel (Task 2/5).

## File map

- `lib/ai-center/slicing-types.ts`: bounded profiles, job/result, packaging and proposal schemas.
- `lib/ai-center/slicing-store.ts`: SQLite jobs, worker pairing, leases, supplies and settings.
- `lib/ai-center/slicing-proposals.ts`: deterministic cost-source mapping and packing calculations.
- `lib/ai-center/store.ts`: wrappers integrating these records with project versions and activity.
- `lib/ai-center/projects.ts`: additive estimate acceptance and invalidation only.
- `app/api/owner/business/slicing/route.ts`: owner commands and snapshot.
- `app/api/slicing-worker/route.ts`: scoped claim/heartbeat/result API.
- `app/api/slicing-worker/asset/route.ts`: exact claimed asset download.
- `scripts/slicer-profiles.mjs`: resolve trusted official resources including machine templates.
- `scripts/slicer-runner.mjs`: isolated executable invocation and cleanup.
- `scripts/slicer-worker.mjs`: manually started worker transport loop.
- `components/ProductPrintEstimates.tsx`: job, cost, supplies and proposal controls.
- `components/ProductProjects.tsx`, `components/BusinessLeader.tsx`: mount controls and leader project action.
- `components/CatalogShipping.tsx`: proposal prefill with explicit owner confirmation.
- `docs/local-slicing-worker.md`, `.env.example`: setup, limits, startup and shutdown.
- Tests named below follow existing standalone Node assertions and server-only loader conventions.

### Task 1: Durable slice jobs and worker pairing

**Files:** Create `lib/ai-center/slicing-types.ts`, `lib/ai-center/slicing-store.ts`, `tests/ai-slicing-store.test.mjs`; modify `lib/ai-center/store.ts`.

**Interfaces:**
- `SliceInput = {projectId,revisionId,sha256,quantity,profileId,profileHash,materialPlan}`. `MaterialPlan = {use:'indoor'|'outdoor'|'unknown',lines:{slot:number,catalogItemId:string,colorHex:string,colorName:string,assignment:string}[],multicolor:boolean}`. Persist it as optional project metadata for backward compatibility; new indoor projects default to a single Black PLA Basic line. Profiles are fixed server allowlist IDs `x2d-04-020-pla-basic`, `x2d-04-020-pla-matte` and `x2d-04-020-petg`; PETG must map to an exact reviewed SKU/profile before enabled. Each maps to reviewed fingerprints. Multicolor additionally needs a validated hardware/project configuration; initially reject unavailable configurations explicitly.
- `SliceResult = {sourceSha256,profileHash,slicerVersion,grams,partGrams:number|null,filaments:{slot:number,consumedGrams:number,purgeGrams:number|null,towerGrams:number|null}[],colorChanges:number,seconds,sizeMm:[number,number,number],warnings:string[]}`; grams is total consumed material. Validate sum of lines against total; preserve unavailable waste/deposited-mass values as null, not zero. Bound valid numbers, positive total/time/dimensions, inherit STL size limit, maximum quantity 100. Reject results beyond printable bounds. Monochrome with no purge/tower may only set partGrams when the provider metadata supports that distinction.
- `SlicingRecords(db:DatabaseSync)` methods `enqueue(input:SliceInput):SliceJob`, `claim(workerId:string,now:Date):SliceClaim|null`, `finish(workerId:string,claimId:string,result:SliceResult,now:Date):SliceJob`, `fail(workerId:string,claimId:string,reason:string,now:Date):SliceJob`, `cancel(jobId:string):void`, `snapshot(now:Date):SlicingSnapshot`.
- `pair(now:Date):{workerId:string,token:string,expiresAt:string}`, `authenticate(token:string,now:Date):string`, `revoke(workerId:string):void`, `heartbeat(workerId:string,now:Date):void`. Random 32-byte token, hash-only storage, 30-day expiration, constant-time verification. Five-minute claim lease, offline after 90 seconds without heartbeat; cancellation invalidates current claim.
- `CenterStore` wrappers verify current project revision/hash before enqueue and finish, within existing transaction boundaries; write existing activity log. Current-job uniqueness is keyed on project/revision/quantity/profile fingerprint. Old jobs remain inspectable but cannot be accepted.

- [ ] Write assertions: new indoor project defaults to Black PLA Basic; outdoor PLA is rejected; unknown use blocks material readiness; different palette/assignments invalidate an old request; missing multicolor hardware/project mapping blocks rather than substitutes black; two equivalent enqueues share ID; parallel claims select one task; 301-second expired lease can be reclaimed once; third attempt fails; expired claim result rejected; cancellation and revocation prevent finish; DB reopen preserves records; snapshot never includes credential hash/token.
- [ ] Run `node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-slicing-store.test.mjs`; confirm failing assertions before implementation.
- [ ] Implement additive tables and strict schemas, transactions/unique request keys, bounded stored diagnostics and clock injection for deterministic tests.
- [ ] Run new store tests plus `tests/ai-projects.test.mjs`, `tests/ai-concurrency.test.mjs`, `tests/ai-asset-quota.test.mjs`; confirm pass and preserve existing records.
- [ ] Commit only Task 1 files with `feat: add bounded local slicing queue`.

### Task 2: Packing and full-cost proposals

**Files:** Create `lib/ai-center/slicing-proposals.ts`, `tests/ai-slicing-proposals.test.mjs`; modify `lib/ai-center/slicing-types.ts`, `lib/ai-center/projects.ts`, `lib/ai-center/store.ts`.

**Interfaces:**
- `PackingPreset = {id,name,internalMm:[number,number,number],externalMm:[number,number,number],boxGrams,protectionGrams,clearanceMm,packagingCents,available,calibrated,quantity}`. Nonnegative known costs/tare, positive dimensions, outside >= inside on each axis, explicit owner calibration.
- `proposePacking(result:SliceResult,quantity:number,presets:PackingPreset[],massAllowanceGrams:number):PackingProposal|null`. Use partGrams, never total consumed grams; unknown partGrams blocks packing pending measurement. For quantity 1 use six permutations with clearance on both sides; sort fitting available calibrated presets by packaging cost then external volume then ID. Quantity >1 requires calibrated preset for that exact quantity; dimensions are the preset's documented tested arrangement. Return exact grams and rounded-up ounce estimate, external dimensions, source IDs and `estimated:true`.
- `proposeSales(result:SliceResult,base:SalesInput,materials:{slot:number,cost:ResolvedMaterialCost,startupWasteGrams:number}[],pack:PackingProposal|null):{input:SalesInput,pricing:ReturnType<typeof calculatePricing>}`. Resolve cost separately for each material/color, multiply by its consumed grams plus only waste not already included, sum then round upward. Time minutes stays fractional. Carry all configured costs/fees and existing failure-rate formula. Unknown line or packing stays null. Preserve per-line provenance outside aggregate SalesInput. No assumed zeros or market prices; never price multicolor bundles from monochrome single-unit multiplication. Restrict such recommendations to a validated sliced quantity or show missing batch estimate.
- Extend project change schema with `acceptEstimate` referencing exact completed job and current version. Save source provenance and optional `sliceEstimate` metadata without recording a physical test. Keep proposal acceptance separate from later sales input acceptance. Any revision/profile/quantity change invalidates relevant accepted proposal. Read existing records lacking new fields unchanged.

- [ ] Write assertions: hypothetical 60.00284×35.57185×11.09980 mm result plus 5 mm clearance fits 76.2×50.8×25.4; explicitly hypothetical deposited mass 7.3903508 g plus 30 g packaging gives 37.3903508 g and 2 rounded ounces (not a claim that the old slicer measured deposited mass); consumed grams including purge never substitute for partGrams; unknown partGrams blocks packing; two differently priced colors sum correctly and purge/tower already included in consumed mass are not charged twice; unpriced color blocks recommendation; unsupported multicolor quantity blocks bundle pricing; permutation-only fit works; insufficient protection/unknown tare/uncalibrated/absent supplies returns null; uncalibrated quantity 3 rejected; actual-average material source wins MSRP; missing costs block options; stale revision acceptance fails; accepting estimate never creates physical PASS.
- [ ] Run `node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/ai-slicing-proposals.test.mjs`; confirm failure before implementing.
- [ ] Implement deterministic proposal calculations and additive project changes. Keep existing zero-shipping release floor and shipping-version gates intact.
- [ ] Run new tests and `tests/ai-sales.test.mjs`, `tests/ai-projects.test.mjs`, `tests/pricing-math.test.mjs`; confirm rounding, margins, stale observations and missing-input behavior pass.
- [ ] Commit Task 2 files with `feat: propose print costs and calibrated packing`.

### Task 3: Owner controls and scoped worker transport

**Files:** Create `app/api/owner/business/slicing/route.ts`, `app/api/slicing-worker/route.ts`, `app/api/slicing-worker/asset/route.ts`, `tests/ai-slicing-api.integration.mjs`; modify `lib/ai-center/slicing-store.ts` as needed for limits.

**Interfaces:**
- Owner GET returns sanitized jobs, current proposals, enabled settings, supplies and worker last-seen; no secrets. Owner POST strict actions `enqueue`, `cancel`, `pair`, `revoke`, `configure`, `acceptEstimate`. Follow requestIsOwner/sameOrigin/body-length/no-store conventions; limit owner JSON to 20 KB.
- Worker POST strict actions `claim`, `heartbeat`, `complete`, `fail` with Bearer token; max 20 KB, one claim per worker, heartbeat at most once/30 seconds, claim at most once/30 seconds, completion max warnings 20×300 chars. Rate limits persist by worker/action in SQLite.
- Asset GET requires worker auth plus current claim ID and SHA; only the exact job's current asset is accessible. `Content-Type: application/octet-stream`, no-store; no buyer data. Enabled=false rejects pairing/claims/enqueues. Default env `AI_CENTER_SLICING_ENABLED=false`.

- [ ] Write HTTP assertions: anonymous owner request 401, foreign origin 403; revoked/expired worker 401; oversized or unknown action 400/413; guessed claim/revision fails; token cannot call owner configure/postage/publishing; duplicate result is idempotent for the same accepted payload, different second payload rejected; rate limit survives restart.
- [ ] Run `node tests/ai-slicing-api.integration.mjs` using the existing isolated integration-test server pattern; prove initial failures.
- [ ] Implement routes against Task 1/2 methods with bounded errors, exact identity checks and constant-time token verification; never return token except successful owner pairing.
- [ ] Run new HTTP tests and existing `tests/ai-api.integration.mjs`, `tests/catalog-shipping-api.integration.mjs`; confirm existing auth/approval behavior.
- [ ] Commit Task 3 files with `feat: add scoped local worker transport`.

### Task 4: Trusted Bambu CLI worker

**Files:** Create `scripts/slicer-profiles.mjs`, `scripts/slicer-runner.mjs`, `scripts/slicer-worker.mjs`, `tests/slicer-runner.test.mjs`; create sanitized fixture JSON under `tests/fixtures/slicing/` from the successful pilot metadata, excluding generated G-code/credentials.

**Interfaces:**
- `resolveProfiles(resourcesDir:string,profileId:string):{machine,process,filament,profileHash}` resolves approved preset names and overlays only template G-code fields, preserving printer identity. Fingerprint normalized resolved contents; compare to reviewed profile hash before claim processing.
- `sliceStl({executablePath,resourcesDir,profileId,source,sourceSha256,workRoot},spawnFn=spawn):Promise<SliceResult>` verifies source SHA, creates private temporary job directory, invokes approved argument-array CLI with shell=false/windowsHide=true/180000ms timeout and cleans up on all paths. Cap diagnostic/result sizes; never accept remote executable/resource paths or uploaded profile JSON.
- CLI worker environment: `AI_CENTER_SLICER_SITE_URL`, `AI_CENTER_SLICER_WORKER_TOKEN`, `AI_CENTER_SLICER_EXECUTABLE`, `AI_CENTER_SLICER_RESOURCES`, `AI_CENTER_SLICER_WORK_ROOT`. Token entered privately, not command-line argument. Site requires HTTPS except explicitly opted-in localhost for tests. Fixed same-origin API URLs; redirects disallowed. No cookie or owner-password handling.
- Loop sends heartbeat every 30 seconds even while slicing; claims only when idle, downloads exact claim asset, slices once, submits complete/fail; bounded backoff 30–120 seconds on connection failure; graceful SIGINT aborts current child and cleans up. No auto-start service or new dependency.

- [ ] Write assertions with fake subprocess/HTTP adapters: machine name survives template merge, profile mismatch rejected, shell metacharacters never execute, modified SHA rejected, timeout kills child and deletes temp directory, oversized result rejected, 401 pauses worker, network loss backs off, SIGINT cleans up, stdout never prints token or asset contents.
- [ ] Run `node tests/slicer-runner.test.mjs`; prove failure before implementation.
- [ ] Implement profile resolver/runner/loop using standard library; copy behavior from the throwaway pilot rather than importing it as a runtime dependency.
- [ ] Run tests; retain the Matte fixture as historical evidence (7.39 g/~20m27s). Create fresh isolated Black PLA Basic and exact PETG fixture slices and verify their own identities/estimates; do not reuse Matte costs/times as Basic/PETG verification. Enable each profile only after its fixture succeeds. Multicolor requires an actual assigned multipart/painted project, verified hardware configuration and per-line purge/time extraction; keep it blocked until that end-to-end slice succeeds. No printer network action.
- [ ] Commit Task 4 files with `feat: run bounded Bambu slicing locally`.

### Task 5: Dashboard, leader action and shipping prefill

**Files:** Create `components/ProductPrintEstimates.tsx`, `tests/slicing-workflow.browser.mjs`; modify `components/ProductProjects.tsx`, `components/BusinessLeader.tsx`, `components/CatalogShipping.tsx`, relevant existing CSS only.

**Interfaces:**
- `ProductPrintEstimates({projectId,projectVersion,revisionId,onSaved})` reads sanitized owner slicing snapshot and uses Task 3 owner commands. Include intended-use selector and material/color/slot assignment controls; indoor default Black PLA Basic, outdoor PETG enforced server-side. Show Color setup needed for missing mapping/hardware and keep selected palette visible. Explain missing calibration/costs, estimates versus actuals, queued/offline/failed/outdated, and revoked pairing. Pair token shown once with explicit private-copy handling; do not persist in browser storage.
- Leader project action **Estimate print** invokes the same strict enqueue action with selected current revision/profile/quantity. Chat drafts can direct the owner to this action; do not claim free-text chat has autonomous tool execution. Leader activity displays real slicing jobs and worker last seen independently of paid language-model roles.
- Shipping prefill requires selecting exact order/project revision/quantity and a current accepted packing proposal. Display external dimensions/tare/protection/source; prefill fields only. Existing owner **Confirm packed parcel** action remains mandatory and invalidates rates on parcel edits. No auto-buy or marking shipped.

- [ ] Add browser checks: offline message without fake running status; one leader click queues one task; result appears with revision/profile/cost provenance; missing cost and uncalibrated supplies prominent; mobile inputs usable; replacing revision marks outdated; no physical-test PASS inferred; packing prefill does not request rates or purchase until explicit confirmation.
- [ ] Run `node tests/slicing-workflow.browser.mjs` against isolated test server; prove initial failures.
- [ ] Implement controls within existing dashboard layout and same-origin commands; retain current release, AI-spend and postage approvals.
- [ ] Run browser checks at phone/desktop widths and existing owner/product/catalog regression checks, then build/lint. Confirm no public credential/estimate exposure.
- [ ] Commit Task 5 files with `feat: show slicing and packing proposals in owner dashboard`.

### Task 6: End-to-end validation, setup and review

**Files:** Create `docs/local-slicing-worker.md`; modify `.env.example`; update draft PR description around final implemented scope and evidence.

**Interfaces:** Documentation lists all Task 3/4 env settings, database backup/retention, private pairing/revocation/expiration, supported profiles, 30-second polling, three-minute timeout, online/offline behavior, supplies calibration and no unattended Railway runtime.

- [ ] Run all appropriate existing Node unit tests plus new tests; run build/lint and dependency audit, report existing dev-only issues honestly. Use repository conventions and bundled Node path when Node is not on PATH.
- [ ] Demonstrate owner pairing, one leader-enqueued real STL slice, accepted proposal, explicitly hypothetical test supplies, cost-floor recommendation with labeled test inputs, revision invalidation and credential revocation in disposable databases. No real customer record or main-site credential is needed.
- [ ] Document verified checks separately from pending physical package calibration, live provider checks and worker deployment. Note that local slicing uses no AI API call, while hosting and paid leader drafts retain their respective costs/approvals.
- [ ] Obtain independent whole-diff review under the applicable review skill; resolve actionable findings and rerun affected checks. Review specifically credential scope, arbitrary subprocess inputs, leases, stale estimate acceptance and shipping gates.
- [ ] Commit docs and prepare/update existing draft PR33 on the feature branch; attach PR to this chat if needed. Do not push main, merge, enable the worker on production or deploy. Present a concrete release checklist and request deployment/pairing approval only after checks pass.

## Plan self-review

Spec sections map to Tasks 1–6: queue/reliability and material intent (1), per-filament costs/packing (2), access (3), local CLI/profile verification (4), owner/leader/shipping UX (5), verification and rollout (6). All five Review Focus conditions have owning tests. Basic/PETG require their own fixture checks; multicolor readiness requires actual hardware/mapping verification. Other profiles, general multi-item packing, Windows auto-start services and Railway slicing remain deferred. Cross-platform evidence flows through existing dated research records; a new web-wide automatic search collector requires a separate focused implementation plan before claiming that capability. Unknown business inputs cannot be solved by tests or invented defaults; they stay visible configuration requirements.

**Execution handoff:** Review this plan before implementation. Continue here with native execution, preserving the owner's earlier preference to implement in this chat, unless the owner chooses otherwise.

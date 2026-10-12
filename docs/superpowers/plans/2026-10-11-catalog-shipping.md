# Catalog Shipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an owner-confirmed packed, paid physical catalog order into one approved 4×6 label and a private owner print link.

**Architecture:** Add a durable shipping ledger inside the existing commerce SQLite database and a deterministic carrier service. The owner UI selects measured packaging and approves an exact current rate; AI roles display work and status but cannot execute postage. Keep existing custom-quote shipping independent and route verified catalog tracking into the new ledger.

**Tech Stack:** Existing Next.js 16, TypeScript, Zod, node:sqlite, EasyPost REST and Resend REST. No new dependency or cloud service.

**Spec:** [Catalog shipping design](../specs/2026-10-11-catalog-shipping.md). Owner approved the written design and this implementation plan on October 11, selecting inline execution in this chat.

## Global Constraints

- No automatic live refunds or unapproved spending.
- Owner authentication, same-origin validation and bounded schemas protect mutations.
- A label means **Label ready**, not **Shipped**; handoff is a separate owner action.
- Test and live carrier credentials/results must match the Stripe order environment.
- Packed ounces and outside dimensions are measured per order; do not substitute filament weight.
- Preserve existing custom quotes, customer checkout, request board and production data.
- Existing $25 AI API cap and individual paid-task approvals remain unchanged; postage is separate.
- No automatic public outreach/listings; no Etsy shipping sync before authorization.
- Maintain a separate review branch and pinned deployments after verification; do not push main.

## Review Focus

- A timeout after carrier acceptance must block a second purchase until exact-shipment reconciliation (Task 2).
- Editing parcel/origin or receiving an order refund during rate review must invalidate approval (Tasks 1–2).
- Competing purchase clicks or a process restart must preserve one durable claim (Tasks 1–2).
- Email timeout, expired provider idempotency retention or missing owner recipient must not trigger postage or an unbounded resend loop (Task 4).
- Tracking duplicates/out-of-order events and a label URL on an unexpected host must preserve state/privacy (Tasks 3–5).

## Files and responsibilities

- `lib/commerce/shipping-types.ts`: bounded parcel/rate/ledger schemas and state types.
- `lib/commerce/store.ts`: additive `order_shipping` table and transactional shipping claims; existing order/product methods stay compatible.
- `lib/commerce/shipping.ts`: eligibility, provider-mode checks, rates, exact approval, buying, reconciliation, handoff and tracking.
- `lib/easypost.ts`: reuse provider helpers with explicit catalog parcel input, 4×6 PNG options and read-only exact-shipment retrieval; preserve quote callers.
- `app/api/owner/catalog/shipping/route.ts`: owner-only bounded commands and private overview.
- `components/CatalogShipping.tsx`, `components/BusinessLeader.tsx`: real order packing/rate/label workflow in the owner center.
- `app/api/owner/catalog/shipping/label/route.ts`, `app/owner/shipping/[id]/page.tsx`: protected, bounded PNG proxy and 4×6 print page.
- `lib/commerce/shipping-email.ts`: escaped transactional owner message, deterministic send key, independent notification status.
- `app/api/shipping/easypost/webhook/route.ts`: verified catalog tracking dispatch alongside existing request tracking.
- `tests/catalog-shipping-store.test.mjs`, `tests/catalog-shipping-service.test.mjs`, `tests/catalog-shipping-email.test.mjs`, `tests/catalog-shipping-api.integration.mjs`: guards, failure recovery and disposable workflow evidence.
- `.github/workflows/validate.yml`, `docs/owner-leader-and-shipping.md`: required checks, configuration and limitations.

### Task 1: Durable packing and approval ledger

**Interfaces:** Export `PackedParcel={weightOz:number,lengthIn:number,widthIn:number,heightIn:number}` with positive finite fields, weight ≤1120 oz, dimensions ≤108 in. Export `CatalogShipping` with orderId, version, state, parcel, address/origin fingerprint, providerMode, shipmentId, rates, expiresAt, selectedRateId, approvedCents, claimId, label/tracking fields and notification state. States: `packed|rated|buying|label-ready|reconcile|handed-off`. Add `CommerceStore.shippingOverview()`, `shippingForOrder(id)`, `packOrder(id,parcel)`, `saveShippingRates(id,version,result)`, `claimShippingPurchase(id,version,rateId,approvedCents,now)` and `finishShippingPurchase(id,claimId,result)`. Keep transactions synchronous; no network call inside SQLite transaction.

- [ ] Write failing store tests: `unpaid_reserved_digital_revoked_orders_cannot_pack`, `pack_invalidates_previous_rates`, `two_connections_claim_one_purchase`, `persisted_claim_survives_reopen`, `refunded_order_cannot_claim`, `expired_or_price_mismatched_rate_cannot_claim`. Use separate connections to one temporary database, synthetic paid orders and a fixed clock.
- [ ] Run `node --experimental-strip-types --experimental-loader ./tests/server-only-loader.mjs tests/catalog-shipping-store.test.mjs`; expect missing interface failures.
- [ ] Implement additive table and exact methods above. Preserve previous ledger/claim for recovery: edits are blocked in buying/reconcile/label-ready/handed-off states. Require current paid/unrefunded physical order in the same transaction as claim. A claim is durable before network access and repeated approval returns existing state rather than another claim.
- [ ] Run store tests and existing `tests/commerce.test.mjs`; expect all passing, including existing inventory/refund behavior.
- [ ] Commit store/schema tests and migration together.

### Task 2: Carrier rates, exact purchase and reconciliation

**Interfaces:** Export `getCatalogRates(store,orderId,version)`, `purchaseCatalogLabel(store,{orderId,version,rateId,approvedCents})`, `reconcileCatalogLabel(store,orderId)`, each returning `Promise<CatalogShipping>`. Reuse `ShippingAddress`, existing site-content origin and EasyPostRate. Add `readEasyPostShipment(shipmentId):Promise<VerifiedShipment>` with a fixed API host, bounded IDs, request timeout and provider-mode verification. Existing quote rate callers continue compiling.

- [ ] Write failing service tests with injected carrier client: `live_key_refused_for_test_order_before_io`, `test_key_refused_for_live_order`, `returned_mode_mismatch_blocks_purchase`, `origin_change_invalidates_rates`, `timeout_after_buy_enters_reconcile`, `same_shipment_read_recovers_existing_label`, `unpaid_after_rates_cannot_buy`, `label_creation_does_not_fulfill_order`.
- [ ] Run service tests; expect missing methods/guards to fail.
- [ ] Implement eligibility and origin/address normalization from the order's Stripe shipping details. Missing/invalid fields block lookup; no model inference. Save exact rate snapshots expiring after 15 minutes. Require unchanged parcel/address/origin fingerprint and exact approved cents. Only the winner of the transaction claim may send the provider buy call; any ambiguous result saves reconcile state. Read the exact shipment to recover an existing label; never mint a replacement shipment automatically. Validate 4×6 PNG, tracking, shipment/mode and approved postage cost; mismatch requires review.
- [ ] Run service/store tests and EasyPost mode tests; expect all passing with call-count assertions proving no second purchase.
- [ ] Commit provider/service and tests together.

### Task 3: Owner packing, rates and protected printing

**Interfaces:** `/api/owner/catalog/shipping` GET returns private ledger/order rows without tokens; POST discriminated commands `pack`, `rates`, `approve`, `reconcile`, `handoff`, `retryEmail`, with UUID IDs, exact version and explicit approval cents. `CatalogShipping` component displays eligible order rows and measured inputs. Protected `/owner/shipping/[id]` print page uses existing owner session generation checks; PNG route verifies owner access and the saved trusted label URL.

- [ ] Write failing API integration checks for no session (401), invalid origin (403), invalid payload (400), conflicting version (409), digital/unpaid order (409), unauthorized print/PNG (401 or sign-in view). Tests enforce a localhost URL and disposable database.
- [ ] Run integration checks against a disposable production build; expect routes missing.
- [ ] Implement bounded routes and UI. Approval button displays order, test/live mode, carrier/service, exact amount, parcel and expiration. Do not label a queued/rated order shipped. Use explicit reconcile/handoff buttons. Print page CSS sets 4in ×6in output. PNG fetch allows saved HTTPS EasyPost file hosts only, rejects redirects, streams ≤5 MB, verifies PNG signature and returns no-store/noindex; public/customer routes never return label URLs or private addresses.
- [ ] Run integration tests and build/lint; inspect desktop, tablet and mobile UI, including long product names and expired rates. Confirm the new table scrolls internally rather than overflowing the page.
- [ ] Commit UI/routes and tests together.

### Task 4: Owner label email without another postage purchase

**Interfaces:** `sendCatalogLabelEmail(store,orderId,client=fetch):Promise<{state:'sent'|'pending'|'failed'|'uncertain';providerMessageId?:string}>`. Reuse `RESEND_API_KEY` and `REQUEST_FROM_EMAIL`; use configured `OWNER_SHIPPING_EMAIL` for the owner recipient. Deploy configuration may set the user-provided owner email privately, without changing sending credentials. Link only to canonical HTTPS `/owner/shipping/{orderId}`; never include customer address/raw label URL. Notification ledger fields record deterministic `catalog-label:{orderId}:{shipmentId}` key, attempts and timestamps.

- [ ] Write failing email tests: `missing_recipient_sends_nothing`, `message_has_only_private_owner_link`, `html_escapes_order_text`, `timeout_reuses_send_key`, `4xx_stops_retry`, `email_failure_never_buys_postage`, `uncertain_send_after_24h_requires_owner_review`.
- [ ] Run email tests; expect missing sender/ledger behavior.
- [ ] Implement an escaped HTML message plus plain text, fixed Resend endpoint, 15-second timeout and deterministic Idempotency-Key. At most three retries for transient errors with backoff; no retry of configuration/authentication errors. Persist sent state before further UI retries; uncertain sends beyond the provider's retention window require explicit review. Call sender only after durable label-ready persistence; email handling never calls purchase. Sandbox email tests use a fake client; actual owner email sending is a separate verified production action to the already-authorized recipient.
- [ ] Run email and shipping service tests; confirm provider call counters isolate mail from postage. Document new recipient variable and independent postage/email/AI costs.
- [ ] Commit sender, ledger/UI status and tests together.

### Task 5: Tracking, full sandbox checks and release

**Interfaces:** `applyCatalogTrackerEvent(store,eventId,tracker):CatalogShipping|null` routes only known catalog tracker/shipment IDs. Existing custom-request webhook dispatch remains intact. Handoff is owner-recorded; a tracker update does not retroactively authorize spending or release unpaid goods.

- [ ] Write failing tracking tests: `unknown_tracker_ignored`, `duplicate_event_ignored`, `delivered_does_not_regress_on_old_event`, `order_refund_flags_review_without_refund_call`. Add them to service tests and CI.
- [ ] Run tracking tests; expect missing dispatcher/ordering safeguards.
- [ ] Implement verified webhook dispatch with preserved custom-request behavior, event deduplication and terminal-state protection. Add tests to CI and operator/setup documentation.
- [ ] Run full CI and disposable end-to-end workflow: synthetic paid physical order → measured parcel → USPS test rates → exact approval → one provider TEST label → inspect PNG 4×6 → protected print access → separate handoff. Confirm duplicate click, timeout reconciliation, mode mismatch, refund block and email failure recovery. Use existing approved isolated sandbox; do not replace the main service's carrier key just to test. Real provider test needs a saved EasyPost TEST key in that environment. No live purchase/refund test without exact separate approval.
- [ ] Request code review; fix important findings, rerun affected checks, prepare PR and pinned deployment. Report actual verified provider/printing/email results and unresolved configuration honestly. Public checkout stays behind its independent release gates.

## Plan self-review

All design sections map to Tasks 1–5. The five failure classes in Review Focus have named tests in their owning tasks. Existing single service/shared persistent storage is reused, with transactional ledger claims across processes. No printer-control integration, automatic spend policy, new provider, or new public outreach feature is added.

**Execution choice:** Approved: implement inline in this chat using executing-plans, with one focused whole-change review before release.

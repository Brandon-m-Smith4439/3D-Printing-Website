# Website product sales setup

The implementation provides `/products`, `/stls`, `/cart` and `/orders`. It does not populate a catalog, configure an account, deploy, purchase shipping, or initiate refunds. Catalog visibility and Checkout are disabled by default. Obtain the owner's explicit launch approval before enabling them in production.

## Storage and switches

| Variable | Default / purpose |
| --- | --- |
| `COMMERCE_DATABASE_PATH` | `commerce.sqlite` beside `DATABASE_PATH`; put this on persistent storage. It must differ from the business, AI-center and marketplace databases. |
| `COMMERCE_ASSET_LIMIT_BYTES` | `100000000` aggregate copied STL bytes. Withdrawn products retain purchased files, so withdrawal does not free asset storage. |
| `COMMERCE_CATALOG_ENABLED` | `false`; only exact `true` exposes approved catalog snapshots. |
| `COMMERCE_CHECKOUT_ENABLED` | `false`; only exact `true` enables new Checkout requests. |
| `COMMERCE_STRIPE_WEBHOOK_SECRET` | Signing secret for the **separate** `/api/store/webhook` destination. Do not replace the existing quote-payment `STRIPE_WEBHOOK_SECRET`. |
| `COMMERCE_SHIPPING_COUNTRIES` | Empty; explicitly set a comma-separated subset of `US,CA,GB,AU`. Physical Checkout refuses an absent/unsupported list. |
| `COMMERCE_SHIPPING_RATE_CENTS` | Unset; explicitly set the fixed USD shipping amount per physical/mixed order. `500` means $5.00; `0` deliberately configures free shipping. This is not a carrier quotation. |
| `COMMERCE_TAX_REVIEWED` | `false`; confirm the actual tax treatment before setting `true`. This acknowledgement does not register the business or calculate tax. |
| `COMMERCE_AUTOMATIC_TAX` | `false`; optionally enables Stripe Tax. |
| `COMMERCE_TAX_REGISTRATION_CONFIRMED` | `false`; must be `true` when automatic tax is enabled, after checking active registrations and product/account tax settings in Stripe. |

Existing `STRIPE_SECRET_KEY`, `STRIPE_LIVE_ENABLED` and `NEXT_PUBLIC_SITE_URL` are reused. Use a suitably permitted restricted sandbox/test key where possible. Production requires an HTTPS site URL. A live key remains locked until `STRIPE_LIVE_ENABLED` is deliberately enabled after the live-payment readiness review. Do not expose secrets in browser code, screenshots, repository files or chat.

Back up the commerce database together with the other persistent sidecars using the supplied backup workflow. A filesystem/database override is an operational setting, not a migration or recovery command.

## Prove the flow in a Stripe sandbox first

1. Use an isolated Stripe sandbox and an isolated local/staging database and volume. Do not test with production customer/order data or a live payment method. Configure the existing verified-customer sign-in flow for this environment.
2. Set `NEXT_PUBLIC_SITE_URL` to the exact test site's origin, set its sandbox key, and keep `STRIPE_LIVE_ENABLED=false`.
3. In Stripe Workbench, create a **snapshot-event webhook destination** for `https://YOUR-TEST-HOST/api/store/webhook`. The handler needs full event objects; thin events are not implemented. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
   - `charge.refunded`
4. Save that destination's signing secret in `COMMERCE_STRIPE_WEBHOOK_SECRET`. Keep the existing quote-payment destination and its separate secret intact. For local testing, the Stripe CLI can forward these events to `http://localhost:3000/api/store/webhook`; use the listener's signing secret for that local process. Do not reuse a production destination secret for the CLI listener.
5. Review tax settings; configure an intentional fixed shipping amount and allowed countries for physical tests. Enable the two commerce switches **only in this isolated test environment**.
6. Prepare and approve a real test product through the owner workflow below. Sign in as a verified test customer, purchase an STL and a physical product using Stripe's sandbox payment methods, and confirm the signed event arrives successfully.
7. Verify paid history/downloads at `/orders`, including a different signed-in device; verify another customer cannot download that order's files. Verify physical stock decreases once, duplicate webhook delivery does not decrease it again, and expired/failed unpaid sessions release their holds.
8. Exercise a sandbox refund through Stripe Dashboard and verify its signed `charge.refunded` event revokes file access and updates the recorded payment total. A refund must carry the original payment-intent metadata; investigate rejected/missing events before launch. Also verify the existing custom quote checkout still works.

No external Stripe sandbox transaction or end-to-end webhook delivery was executed during implementation. Local tests validate the store's state transitions and authorization; they do not replace this account/configuration check. Use [Stripe's fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) and [webhook setup guidance](https://docs.stripe.com/webhooks).

## Prepare the first product

1. Add an idea in the private business workspace. Keep research observations and their limitations with its project.
2. Upload or generate an original STL revision. Slice it and physically print/test that **exact** revision. Structural STL checks do not establish fit, strength, safety or printability.
3. Record a passing physical test and prepare its release package with accurate descriptions, both prices, direct-cost estimate, license/instructions and originality acknowledgement.
4. In **Reviewed website catalog & orders**, choose the tested project from the dropdown. Its label shows project version, date and revision identity. Projects without an eligible tested release are excluded.
5. Supply an owner-hosted public HTTPS photo URL showing the actual tested product. Supply the finished units allocated **only to the website**; the default is zero. Prepare the private snapshot, review its facts, then approve it separately.

Approval alone does not enable the server launch switches. A new STL revision or invalidated source release hides the old product from new catalog purchases. Previously paid customers retain the exact copied revision they purchased unless their entitlement is revoked. A project/revision can have one immutable catalog snapshot; editing product text/prices/photos in place is not implemented. Prepare a new reviewed revision/release for a replacement snapshot.

## Payment, inventory and delivery behavior

- Browser carts submit item identities, format and quantity. Prices come from the approved server snapshot. USD is the only checkout currency. STL quantities are one; physical quantities are bounded.
- Physical stock is reserved atomically across processes before creating Checkout. One unresolved checkout is allowed per verified customer. Holds reduce catalog availability; successful paid fulfillment decreases finished stock once.
- Checkout sessions are requested with a 30-minute expiry and an idempotency key. Returning to the success page does **not** establish payment or release downloads. A verified Stripe event, or owner-requested read-only reconciliation, validates stored session/order identity, item fingerprint, Stripe mode, currency, subtotal, shipping, discounts and tax total first.
- Signed expiry or asynchronous failure releases an unpaid hold. Unknown network/process outcomes retain it. A webhook can safely bind a matching session if the process failed before storing its session ID.
- `/orders` uses the existing verified customer account. Purchases are associated with a hashed account identity, so history and STL downloads follow that account across devices. The server checks account ownership, paid entitlement, purchased product/revision and file hash. A supplied customer ID is never trusted.
- A browser-held bearer token is an alternative recovery credential; only its hash is stored. Owners can replace a paid order's token after independently verifying the buyer. Replacement invalidates the previous token. Customers can enter it through the cart's recovery form. Tokens must be shared privately.
- Physical fulfillment remains owner work: pack, obtain the actual shipping label externally, and record the customer-visible shipped/tracking note. The application does not buy labels, choose carriers, send transactional email or guarantee delivery times. Configure Stripe receipts separately if desired; do not assume receipts are enabled.
- Refunds are initiated externally by the owner. The webhook observes cumulative refunds, does not initiate them, and revokes digital access conservatively even for a partial refund. It does not automatically restock physical products. The owner can also revoke access without issuing a refund.

## Investigate held or disputed outcomes

The owner order overview shows pending holds and their session IDs. For a bound session, use **Read Stripe status and reconcile**: this retrieves the configured account's session without charging, refunding or cancelling it remotely. A confirmed paid session fulfills; a confirmed expired session releases stock. An open/pending session stays held.

For an unknown **unbound** session, wait at least 35 minutes, search Stripe Dashboard for the order ID in session/payment metadata, and inspect any matching payment/session first. Only if no matching session or payment exists, enter an investigation reference and explicitly acknowledge that fact before releasing the local reservation. The acknowledgement and note are recorded. A late bind or payment after release is rejected for investigation; it is not silently fulfilled or automatically refunded. This exceptional action depends on a truthful owner check.

Payment mismatches, stale payments and webhook failures need owner investigation and Stripe event retry/reconciliation. A lost browser response does not remove an account-bound purchase from `/orders`. No claim of autonomous exception resolution is made.

## Etsy and financial limits

Website stock and Etsy stock must be physically allocated separately. For example, ten finished units cannot safely appear as ten available units on each channel. There is no atomic cross-channel inventory synchronization.

The owner metric is recorded paid total including shipping and tax, less observed cumulative refunds. It is not product revenue, contribution profit, bank reconciliation or a complete accounting report. External refunds without matching observed events, disputes, chargebacks, Stripe fees and shipping purchases require reconciliation outside this MVP. Purchase confirmations and customer service communications are not automatically sent by this subsystem.

Before approved production launch, finish sandbox verification, review actual product photos/licenses/prices and shipping/tax treatment, configure persistent storage/backups, and obtain the owner's launch approval. Enabling billing or adding a key alone does not make an untested product sellable.

# Owner leader, in-person intake and shipping checks

## Access

Open `/owner`, enter the existing owner password, then enter the current authenticator code. The embedded login now uses the same second-factor flow as `/login?admin=1`. Successful verification loads the owner dashboard. Open `/owner/business` for the business controls; both pages use the existing owner session. No credentials were changed.

## Leader and agents

Select a business, enter an instruction and select **Send to leader**. Each message is a bounded plan task, not a continuous conversation with automatic access to previous messages. Approve any paid task individually in the approvals inbox. The configured worker processes eligible tasks. Read its response in the leader conversation. Project delegation queues a bounded next step from an approved plan; physical testing and publication still require review.

The activity table shows Leader, Research, Design & refinement, Listing, Operations, Outreach drafts, Product ideas, Pricing & sale preparation, and Product image drafts. Expand each latest recorded task to inspect its brief, status, provider/model, output and failure reason. Counts cover the latest 200 jobs, not lifetime history. These are roles in the shared worker, not nine constantly running independent processes.

Research evaluates evidence supplied in briefs and authorized Etsy API observations; it does not have an unrestricted browser. Until Etsy approves the app and shop authorization succeeds, use dated Marketplace Insights observations. Searches, asking prices and badges do not establish a product's sales or profit. Follow demand patterns while making original designs; do not import another seller's model without an appropriate license.

## In-person projects

Use **Log an in-person project** in the Mesh Harbor leader section. Enter notes without contact details or secrets. **Ask Operations to draft** queues an ordinary Operations task, subject to existing API spending approval and monthly/role limits. When completed, select **Review this draft**, correct name, description, quantity and stage, then **Approve and save to request board**. The manual review option works without a paid model call.

Maybe projects use `on-hold`; active stages include preparing, printing, finishing and ready. AI output accepts only non-financial draft fields. You can optionally enter customer email/phone in the review form and explicitly confirm those details; they are stored only with the request and never sent to the AI. Saving disables customer notifications and does not create a quote, payment, production queue job or email. Add contact now if you will need quote email later; existing saved request contact fields are read-only. Manage quotes separately on the existing owner request board. The free provider creates a valid basic template, not an AI interpretation. Invalid AI output stays unsaved. Stable draft keys deduplicate retry saves within the existing request store's serialized mutation path; repeat review of the same agent draft uses the same key. This follows the existing single-web-process storage architecture and does not add distributed locking.

## EasyPost test labels

The business center includes **Generate a 4x6 test-only shipping label**. It requires the existing `EASYPOST_API_KEY` to be an `EZTK_` test credential. The endpoint refuses missing/production credentials before network access; it does not change the key. It creates a disposable carrier fixture shipment, selects the cheapest returned USPS test rate, and requests a PNG 4x6 label. Both responses must identify test mode and the purchase must identify the created shipment. The returned HTTPS label URL is limited to EasyPost's file storage host. Owner authentication, same-origin protection, a 15-second request timeout and a one-minute process-local cooldown apply.

Test addresses, weight and dimensions are synthetic fixtures, not packaging defaults. Test labels are not usable postage. No real order, shipment record, email or payment is changed. Provider errors return a generic message without credentials. There are no new environment variables.

Actual carrier testing is incomplete until an owner signs in and an EasyPost test key is configured in the tested environment. Unit tests use synthetic responses and prove the guards, not carrier connectivity. Existing custom-quote shipping controls remain in `/owner`; a known tracker ID cannot be overwritten by an unrelated TEST event sharing the same tracking number. Older records with no tracker ID retain their existing tracking-number fallback.

## Paid website order shipping

In the Mesh Harbor leader section, **Pack and ship website orders** lists up to 100 stored physical orders. Paid, unrefunded orders can be packed; digital-only and unpaid orders cannot. Review the configured return address, enter measured complete-package ounces and outside box dimensions, then request carrier rates. Entering or editing a package clears previous rates. Rates expire after 15 minutes and the server rechecks the exact current provider rate, package, origin, address, order payment and version before claiming a purchase. A TEST order requires a TEST key/result; production orders additionally require `EASYPOST_LIVE_ENABLED`.

Approve one exact rate for one packed order. A durable SQLite claim prevents duplicate purchases across processes and restarts. Carrier timeouts/mismatches become **reconcile**; **Check original shipment** only reads that shipment and can recover its existing label. No forced second purchase or automatic postage refund is available. Unresolved no-label outcomes need inspection of the exact shipment in EasyPost. A label is **label-ready**, not shipped. Print through the owner-protected 4×6 page, then explicitly confirm handed to carrier. Refunded/revoked orders flag owner review and block shipping/printing. Signed catalog tracking events are deduplicated; stale events cannot regress delivered status. A tracking event does not authorize postage or mark owner handoff.

`OWNER_SHIPPING_EMAIL` is the only new configuration variable. Set it privately to the owner's requested recipient. The existing `RESEND_API_KEY`, `REQUEST_FROM_EMAIL` and canonical HTTPS `NEXT_PUBLIC_SITE_URL` are reused. Label-ready purchases/recoveries attempt one owner notification containing a protected print link, not the customer address/raw carrier URL. Missing sender/recipient setup leaves it pending without invalidating the label. The email has its own durable claim and at most three provider attempts; retries use one event key and cannot buy postage. Uncertain sends beyond 24 hours require delivery review and are not automatically replayed. Keep recipient/sender stable while resolving a send; Resend requires matching payloads for the same [idempotency key](https://resend.com/changelog/idempotency-keys).

API: owner-only `/api/owner/catalog/shipping` commands `pack`, `rates`, `approve`, `reconcile`, `handoff`, `retryEmail`; protected print page `/owner/shipping/{orderId}` and PNG proxy `/api/owner/catalog/shipping/label?id={orderId}`. All mutations require same origin, bounded schemas and current owner authentication. The additive `order_shipping` ledger is inside the existing backed-up commerce database. No new dependency/provider, customer-message campaign or autonomous spend authority is added.

Software tests and fake provider responses do not establish actual EasyPost connectivity, label printability, email delivery or live postage readiness. Verify those in the isolated TEST environment before release; real postage still needs an exact separate order/rate approval. Postage and email/hosting costs are separate from the $25 AI cap. Etsy order shipping remains unavailable until developer approval and shop authorization.

## Release limitations

### Optional isolated fulfillment QA

The ordinary checkout fixture still rejects `EASYPOST_API_KEY` and `RESEND_API_KEY`, workers, paid AI and Etsy. An explicitly approved fulfillment test uses `COMMERCE_SHIPPING_SANDBOX_ENABLED=true` plus dedicated variable references `CATALOG_SHIPPING_TEST_EASYPOST_API_KEY` and `CATALOG_SHIPPING_TEST_RESEND_API_KEY`. This requires `COMMERCE_SANDBOX_FIXTURE=true`, four distinct databases in one `sandbox-data` directory, both live-payment/postage flags exactly `false`, a test-only `EZTK` key and a configured `OWNER_SHIPPING_EMAIL`. Generic carrier/email credentials must remain absent. Invalid configuration fails before provider use; aliases cannot activate on the main site's data paths.

Only catalog label notifications use the test email alias, always addressed to the configured owner. Generic account/customer email helpers still have no Resend credential. Test label email rejects a production-mode label. The canonical HTTPS address must point to the isolated test site, so the protected print link resolves against its separate data. This mode is for manual owner testing; it does not enable autonomous postage, customer email, marketing, Etsy or AI. Remove these dedicated test references before disabling the explicit QA flag.

The $25 monthly AI cap and individual spending approvals remain unchanged. The refined Meshy model has owner-reported successful printing; its revised grams/time/cost must be recorded before pricing uses those measurements. Website renders must accurately represent the model and be labeled. Etsy physical-product listings still need imagery that meets Etsy's actual-product photo rules. Public catalog checkout is not enabled merely because isolated Stripe sandbox tests passed; tax/shipping/pricing and the main catalog webhook need their own release checks.

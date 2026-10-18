# Catalog shipping automation — reviewable design

The goal is to turn a paid physical website order into an approved, printable 4×6 shipping label with minimal owner work. The owner still prints/packs the item, measures the complete package, and approves actual postage. Existing custom-quote shipping and Etsy orders remain separate until their respective integration is verified.

## Owner experience

1. The Operations role presents paid physical catalog orders in **Ready to pack**. Unpaid, revoked, digital-only and already fulfilled orders cannot request postage.
2. You mark the package ready and enter measured ounces and outside box dimensions for that order. Your configured return address is shown privately for confirmation. No filament weight is substituted for packed weight.
3. The service requests carrier rates for the confirmed address and parcel. The approval card displays order, carrier, service, exact price, environment (TEST/LIVE), package and rate expiration. Rate lookup does not buy a label.
4. You approve one selected rate. The server atomically claims this purchase in the catalog database before contacting EasyPost. Credentials and returned provider mode must match the order environment. A changed/expired rate requires a new approval.
5. A successful response saves shipment ID, tracking, label and approved postage cost. Creating a label marks **Label ready**, not **Shipped**. You print the 4×6 label and mark handed to carrier separately.
6. The service emails your configured owner address a sign-in-protected print link. The email does not embed the customer's address or a publicly reusable label URL. Notification status and a retry control appear in the owner view. A failed email never triggers another postage purchase.

## Reliability and boundaries

- Store parcel/rate versions, selected rate, approval, purchase claim and shipment result durably in the existing commerce SQLite database, using an additive migration. Protect every operation with owner authentication, same-origin validation and bounded schemas.
- A timeout or crash after a purchase request becomes **Needs reconciliation**. Read the exact EasyPost shipment before allowing another action. Do not blindly retry a purchase or mint a replacement shipment.
- Recheck paid/unrefunded order status and parcel/rate version at purchase time. Duplicate clicks and competing requests share one durable claim. An order refund after purchase flags shipping review; it does not automatically refund postage or ship goods.
- Existing EasyPost webhook tracking should route catalog shipment IDs as well as custom requests, with verified events and duplicate handling. Keep label credentials/addresses out of AI briefs and public API responses.
- AI can identify work, explain status and prepare tasks. Actual postage approval and purchase use deterministic server code, with no model access to payment credentials. No automatic live refunds or unapproved spending.
- Keep AI API spend under the existing $25 cap; postage is a separate per-order cost. Email and hosting fees are separate from AI usage.

## Verification before release

Use a disposable catalog database and EasyPost TEST credentials. Verify unpaid/digital/revoked orders rejected, incorrect origin/unauthenticated requests rejected, changed parcel/expired rate rejected, concurrent duplicate approval creates one label, environment mismatch blocked, provider timeout stops retries until reconciliation, label creation does not mark shipped, and email failure/retry cannot buy again. Then generate a real provider test label, inspect its 4×6 size, and check the owner print link. Live postage remains untested until a real packed order and exact rate are explicitly approved.

## Out of scope for this release

Automatic purchase without individual approval, label-printer device control, Etsy shipping sync before app approval, replacing existing custom-quote payment gates, and automatic public marketing messages.

This design requires a durable order-to-carrier bridge; it is a new subsystem rather than a presentation change. Implementation has not started. The approved automation intent authorizes preparing this design. The brainstorming skill requires written-spec review before its implementation plan is prepared.

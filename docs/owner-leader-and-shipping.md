# Owner leader, in-person intake and shipping checks

## Access

Open `/owner`, enter the existing owner password, then enter the current authenticator code. The embedded login now uses the same second-factor flow as `/login?admin=1`. Successful verification loads the owner dashboard. Open `/owner/business` for the business controls; both pages use the existing owner session. No credentials were changed.

## Leader and agents

Select a business, enter an instruction and select **Send to leader**. Each message is a bounded plan task, not a continuous conversation with automatic access to previous messages. Approve any paid task individually in the approvals inbox. The configured worker processes eligible tasks. Read its response in the leader conversation. Project delegation queues a bounded next step from an approved plan; physical testing and publication still require review.

The activity table shows Leader, Research, Design & refinement, Listing, Operations, Outreach drafts, Product ideas, Pricing & sale preparation, and Product image drafts. Expand each latest recorded task to inspect its brief, status, provider/model, output and failure reason. Counts cover the latest 200 jobs, not lifetime history. These are roles in the shared worker, not nine constantly running independent processes.

Research evaluates evidence supplied in briefs and authorized Etsy API observations; it does not have an unrestricted browser. Until Etsy approves the app and shop authorization succeeds, use dated Marketplace Insights observations. Searches, asking prices and badges do not establish a product's sales or profit. Follow demand patterns while making original designs; do not import another seller's model without an appropriate license.

## In-person projects

Use **Log an in-person project** in the Mesh Harbor leader section. Enter notes without contact details or secrets. **Ask Operations to draft** queues an ordinary Operations task, subject to existing API spending approval and monthly/role limits. When completed, select **Review this draft**, correct name, description, quantity and stage, then **Approve and save to request board**. The manual review option works without a paid model call.

Maybe projects use `on-hold`; active stages include preparing, printing, finishing and ready. The intake endpoint accepts only these non-financial fields. It never creates a quote, payment, production queue job, contact record or notification. Add contact/quote details separately on the existing owner request board. Invalid AI output stays unsaved. Stable draft keys deduplicate retry saves within the existing request store's serialized mutation path; repeat review of the same agent draft uses the same key. This follows the existing single-web-process storage architecture and does not add distributed locking.

## EasyPost test labels

The business center includes **Generate a 4x6 test-only shipping label**. It requires the existing `EASYPOST_API_KEY` to be an `EZTK_` test credential. The endpoint refuses missing/production credentials before network access; it does not change the key. It creates a disposable carrier fixture shipment, selects the cheapest returned USPS test rate, and requests a PNG 4x6 label. Both responses must identify test mode and the purchase must identify the created shipment. The returned HTTPS label URL is limited to EasyPost's file storage host. Owner authentication, same-origin protection, a 15-second request timeout and a one-minute process-local cooldown apply.

Test addresses, weight and dimensions are synthetic fixtures, not packaging defaults. Test labels are not usable postage. No real order, shipment record, email or payment is changed. Provider errors return a generic message without credentials. There are no new environment variables.

Actual carrier testing is incomplete until an owner signs in and an EasyPost test key is configured in the tested environment. Unit tests use synthetic responses and prove the guards, not carrier connectivity. Existing custom-quote shipping controls remain in `/owner`. The catalog-order label purchase/reconciliation and secure owner email delivery bridge is still unfinished; do not describe shipping as fully automated or buy real postage before an exact packed order and rate are approved.

## Release limitations

The $25 monthly AI cap and individual spending approvals remain unchanged. The refined Meshy model has owner-reported successful printing; its revised grams/time/cost must be recorded before pricing uses those measurements. Website renders must accurately represent the model and be labeled. Etsy physical-product listings still need imagery that meets Etsy's actual-product photo rules. Public catalog checkout is not enabled merely because isolated Stripe sandbox tests passed; tax/shipping/pricing and the main catalog webhook need their own release checks.


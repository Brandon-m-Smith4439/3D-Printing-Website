# Product sales preparation

Owner dashboard: https://meshharbor3d.com/owner/business → Product projects → select a project → **Prepare product for sale**. This feature prepares private price experiments, listing copy and optional AI concept images. It does not publish listings, send outreach or change checkout prices.

## Owner workflow

1. Upload/generate an original STL revision, physically test it and record the result. The latest revision must have a passing test. A later revision invalidates prepared sale tasks and release approvals.
2. Open **Costs & channel fees**. Confirm material cost, print time, printer operation, failure allowance, packaging, handling labor, postage, shipping income, per-order overhead, digital support and estimated tax subject to payment fees. Blank means unknown; enter zero explicitly where applicable. Historical purchase invoices do not establish current inventory or sales.
3. Configure both website and Etsy fee profiles using your actual account rates. Defaults propose 40% contribution margin and $3 contribution per order; both are adjustable. Save the estimates. Unknown costs or infeasible margins block calculated recommendations and release preparation.
4. After Etsy API approval and connection, collect official Etsy observations. Confirm function/size, physical print versus digital STL, variant price and included quantity before marking a comparable match. Alternatively add dated HTTPS sources manually and save. Official search observations start unconfirmed, with unknown format, quantity and shipping; asking prices do not prove sales.
5. Click **AI: prepare prices and listing draft**. The engine uses its configured text provider. Template mode is a free local draft, clearly identified as such. OpenAI mode queues a separate spending approval. Save changed costs before queuing; repeated clicks for the same version reuse the job.
6. Optional images require the image settings below and their own spending approval. Review the resulting draft/image in the project and approvals inbox. Generated images are illustrative concept previews: the image model does not consume the STL or render verified CAD geometry. Use an original photograph of the final physical product for Etsy; inspect all imagery for accurate shape, dimensions and color.
7. Prepare the private release package with accurate description, license, stock and prices. The current release has one physical and one digital price shared across channels, so each must meet every channel's unit floor. Release floors assume **zero shipping income** because website shipping rates and Etsy shipping profiles are configured separately. The table shows this stricter floor alongside experiments that include entered shipping income. Bundle experiments for 3/5 prints require separate correctly described listings; this feature does not create bundle catalog SKUs.
8. Publication, stock/shipping/tax checks and public checkout remain separate owner-approved workflows. Completing an AI draft is not proof that a listing is launch-ready.

## How pricing works

Physical production cost = quantity × (material + print minutes × printer hourly cost / 60) / (1 − failure allowance). Packaging, handling, postage and per-order overhead are added per order. Digital costs use digital support and per-order overhead. Fixed fees include payment and listing/renewal fees. Estimated fee-bearing tax is charged the combined percentage as a conservative approximation, not a jurisdiction-specific tax calculation.

The calculator finds a price meeting both contribution dollars and contribution margin after entered variable costs and rounded fees. Experiment prices round up to $0.50. At least three unique confirmed same-format/quantity USD observations from the last 30 days allow their asking-price median to raise the experiment above its floor. Future, stale, duplicate, unconfirmed and non-USD observations are excluded. Shipping of competing listings remains separate; no exchange rates or sales volumes are invented. Contribution is not net profit: actual costs, returns, fixed overhead and taxes still matter. Conversion-based optimization needs actual selling data and remains future work.

## AI image setup and billing

No new secret is required. Reuse Railway `AI_CENTER_OPENAI_API_KEY`, configured privately. In the owner dashboard's spending controls:

- Retain the $25 monthly total limit (2500 cents); business and role caps also apply.
- Enable paid API jobs and the image provider only when ready. Images default disabled, with each image role budget zero. Set a small image role allowance within the business/global budget.
- Select a supported image model (`gpt-image-2` or its pinned snapshot). Verify current provider pricing and account eligibility before enabling. Defaults are 250 cents/million input text tokens and 1500 cents/million output image tokens; higher configured rates are supported. See https://developers.openai.com/api/docs/models/gpt-image-2 and https://openai.com/api/pricing/.
- Each job freezes the model and price profile displayed for its spending approval. One low-quality 1024×1024 PNG is requested from the fixed OpenAI image endpoint. Organization verification/model access may be required by OpenAI; this integration cannot complete that for the owner.

An image job reserves a conservative 100,000 output tokens plus bounded input before execution (about $1.51 with default rates), not a claim about its eventual cost. Actual reported usage determines the charge. This is an application reservation, not a provider-enforced spending maximum. Missing/invalid usage, timeouts or uncertain failures retain the reservation and are not retried automatically. An over-reservation charge halts paid AI for review. OpenAI billing is separate from ChatGPT seats; provider invoices remain authoritative. Review costs before changing models/prices.

Generated PNGs stay in the existing private asset store with a 5 MB per-image bound and shared storage quota (`AI_CENTER_ASSET_LIMIT_BYTES`). Owner-only access, no-store headers, same-origin mutations and current project-version checks apply. No new migrations or packages are needed; older saved settings receive disabled image defaults.

## Etsy setup and remaining limitations

Register/check the app at https://www.etsy.com/developers/your-apps, wait for Etsy's approval, then follow `docs/ETSY_SETUP.md` to configure private app credentials, redirect URI and encrypted OAuth token storage. Browser/Apple login does not authorize the worker. `ETSY_ENABLED` and `ETSY_RESEARCH_ENABLED` must be enabled only after configuration; `ETSY_WRITES_ENABLED` remains separately gated.

The research collector uses the existing official read-only API adapter and rate controls. Collection replaces a project's comparable sample and changes its version. It does not scrape Etsy or prove best-selling individual products. Background drafts do not upload product photos or publish. Owner fact checking, real photographs, confirmed costs/material, approved listings and channel configuration remain required. Owner requests are bounded to 20 KB; shorten lengthy comparable URLs/notes or use fewer observations if a save exceeds that limit.

Automated tests exercise provider responses with fixtures; they do not verify this account's live image-model access or Etsy approval. A bounded owner-approved live image smoke test remains necessary before relying on runtime image generation. Public cart-to-order-to-protected-download testing remains a separate launch check.

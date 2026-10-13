# Meshy integration implementation plan and setup

Approved scope: optional Meshy REST generation in the existing owner project flow. One generation (20 credits), optionally one separately approved repair (10 credits), no purchases or public publishing.

1. Durable private queue, frozen original prompt and intended dimensions, owner spending approval, monthly credit reservations. Never retry ambiguous submissions.
2. Background status checks, bounded private STL downloads, free FDM printability analysis, optional single repair. Owner imports a structurally valid, scaled revision and performs slicer/physical tests.
3. Owner controls and a notification-only webhook; callbacks cannot supply trusted status or files. Polling remains authoritative and recovers missed callbacks.
4. Regression checks, independent review, private pilot when the dedicated key is configured, and remaining commerce launch checks.

The existing $25 OpenAI monthly limit does not include Meshy's subscription or credits. Meshy uses its own credit cap (30 by default). No recharge or subscription change is automated.

Environment: AI_CENTER_MESHY_ENABLED=true explicitly enables jobs; AI_CENTER_MESHY_API_KEY is a dedicated private key; AI_CENTER_MESHY_MONTHLY_CREDITS defaults to 30. Set the same 30-credit limit on the key at https://www.meshy.ai/developers/keys. Never share the key in chat.

Meshy webhook documentation currently describes no signing protocol. The receiver accepts only a bounded task ID as a notification for an existing task. It ignores supplied status, URLs, credentials and reports. It cannot create tasks, charge credits, publish or approve anything. Register the HTTPS receiver at /api/meshy/webhook only after deployment. The worker fetches actual results from Meshy using its own key.

Generated models are candidates, not validated products. Tight tolerances still use CAD. Private raw files may require owner decimation before import into the existing 1 MB / 20,000-triangle project checker. Structural success and Meshy's analysis do not replace a physical print test. Original product photography, actual costs, stock, shipping and Etsy authorization are still required before selling.

Verification: 58/58 local regression files pass; production build/TypeScript and changed-source lint pass. Twelve isolated production HTTP checks cover owner authentication, origin, size bounds, missing key, private headers and hostile webhook fields. The existing sixteen sales HTTP checks also pass. Meshy fixtures cover no spend before approval, duplicate prevention, credit caps, safe download host, private assets, dimension scaling, physical-test invalidation, one repair, transient GET failures and stale-worker lease fencing. An independent reviewer reproduced the last two defects before fixes; regression tests now pass.

Recovery: ambiguous generation/repair/analysis submissions are never automatically repeated. Status/download reads may retry without generating a new billed model. A token on each claimed poll prevents old responses from erasing newer files/analysis IDs. Unknown analysis is explicitly advisory and does not count as a physical test; an owner may import a structurally valid file for manual testing. Oversized or structurally invalid candidates remain private raw downloads for manual refinement. A provider-reported charge above the reserved bound blocks further Meshy work until owner reconciliation.

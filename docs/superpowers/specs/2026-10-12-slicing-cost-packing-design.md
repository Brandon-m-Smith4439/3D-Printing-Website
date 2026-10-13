# Automated slicing, costing and packing — proposed MVP

## Outcome and scope

The owner asks the leader to estimate a current STL revision. A local worker uses
Bambu Studio to slice it; the website receives structured estimates, proposes
packing from the owner's supplies, and calculates price recommendations using
existing cost and comparable-price tools. The owner can review status and results
from any device. Physical print acceptance, catalog release and exact postage
approval remain separate actions.

This document defines production integration of the approved local feasibility
pilot. It has not been implemented or deployed. Default profile is X2D, 0.4 mm,
0.20 mm Standard, Black PLA Basic, Textured PEI Plate. Material and colors may
change for a particular product. Outdoor products require PETG; never silently
fall back to PLA when an approved PETG profile or suitable stocked color is absent.
An outdoor designation is a selection rule, not proof of heat, UV or load safety:
product-specific suitability still needs review and a physical test.

## Product material and color requirements

Record intended use (indoor, outdoor or unknown), required material family and
explicit color palette on each project. Unknown use needs owner clarification
before material readiness. A new indoor single-color project defaults to Black
PLA Basic. PETG uses a tested exact Bambu profile/SKU; do not assume PLA settings
or prices apply. Other material choices remain allowed for indoor designs through
tested profiles and owner acceptance.

When color is part of the selected product's appearance or function, preserve
that intent in the design. A selected multicolor product should have a matching
multicolor proposal, not silently become black. Record color-to-part or region
assignments and slot mapping. An STL does not preserve color assignments; require
separate component geometry or an explicitly reviewed color-painted project.
Missing assignments, suitable materials or confirmed multi-material hardware
means **Color setup needed**. Do not infer that the owner has AMS hardware.

For multicolor, the slicer result must report each material/color's consumed
grams and waste, including purge/flush and prime tower where applicable, plus
total time and color changes. Cost each filament from its own source and sum the
lines; avoid charging purge twice. If the slicer cannot distinguish deposited
mass from discarded purge/tower, do not use total consumed mass as finished-part
shipping weight. Flag the missing deposited mass or require a measured sample.
Bundle slicing and color-change costs cannot assume quantity times a single
monochrome estimate; require a validated batch slice when those effects matter.
Multicolor support remains unavailable until an actual mapped project and
configured hardware profile pass the local CLI test. Unsupported work stays
visible and blocked, never reported as a completed monochrome substitute.

## Approach selection

1. **Recommended: local slicer worker, online queue and results.** Reuse installed
   Bambu Studio and validated presets. Computer must be awake and worker running.
   Slicing has no model API fee, but online hosting still has costs.
2. Railway-hosted slicer: supports always-on operation, but requires proving Linux
   runtime dependencies, compatible presets, resource limits and recovery. Defer
   this until the local workflow has passed integration tests.
3. Manual estimate entry: keep as a fallback when the local worker is unavailable.
   Do not present manual values as automatically sliced or measured.

No new paid provider, slicer subscription or printer connection is needed for
the recommended MVP. Do not install a background Windows service automatically.

## Owner experience

- Current product project gains **Estimate print** and a results panel showing
  queued, slicing, completed, failed, outdated or worker unavailable. A leader
  request creates the same bounded task; it does not execute arbitrary commands.
- Show revision, source hash, selected printer/material/process, slicer version,
  profile fingerprint, dimensions, grams, total time and warnings. Always label
  these as slicer estimates. Any physical test record remains owner-entered.
- Show a cost breakdown, source for material cost, missing inputs, channel-specific
  minimum price, proposed price, estimated contribution and market sample count.
  Estimated contribution is not business net profit or guaranteed demand.
- Packing proposal shows selected box, outside dimensions, estimated complete
  package weight, included packing materials, quantity and calibration status.
  Empty or uncalibrated supplies produce **Packing setup needed**, not a fake box.
- Owner confirms the real package before carrier rates or postage. Confirmation
  can accept a calibrated preset after checking actual contents; a changed parcel
  invalidates existing rate approval through the existing shipping workflow.
- Local worker status must say online/offline and last seen, not suggest an agent
  is working when nothing is running. Documentation explains starting/stopping it.

## Queue, worker and storage

Use an additive bounded slicing-job table in the existing AI-center SQLite
database. Each job binds project ID, current revision ID/hash, quantity, profile
fingerprint and request key. Store queued/running/completed/failed/cancelled state,
claim token, lease expiration, attempts, timestamps and validated output. Do not
reuse the paid language-model draft queue's spend reservation for local slicing.

The server claims at most one job for a paired local worker. A duplicate request
for the same current inputs returns the existing active job. A timed-out slice
has no external purchase side effect, so a lease can be reclaimed at most once;
after two failed attempts require owner retry. Results from expired claims or
superseded revisions cannot overwrite current estimates.

The local worker uses argument-array process spawning with shell disabled,
private per-job temporary directories, one process at a time and a three-minute
timeout. Only bundled/validated profile IDs are accepted; neither AI text nor
uploaded model names can become flags, executable paths or scripts. No arbitrary
profile upload, printer discovery, printer network commands or automatic G-code
execution is supported. Generated G-code stays temporary; do not publish it.

Accept only stored owner-project STL assets within current size limits. Verify
hash before slicing. Resolve complete official preset inheritance and machine
G-code templates without replacing printer identity. Fail on incompatible
profiles, malformed output, non-finite/non-positive numbers, excessive bounds or
resource limits. Store only bounded structured output and diagnostic categories;
delete job temporary files in cleanup. Do not expose raw paths or logs publicly.

Existing project JSON remains readable with optional new estimate references.
New model revisions invalidate slice, packing and pricing readiness. A profile,
quantity, material-cost or packaging change invalidates the affected proposal;
it does not erase historical physical tests or previously recorded orders.

## Pairing and access

Owner-only same-origin APIs create/cancel jobs and configure supplies. A separate
worker credential can only claim assigned STL jobs, download their exact asset,
send heartbeat and submit bounded results. It cannot read customer addresses,
change pricing settings, publish products, buy postage or call paid AI providers.
Store only its hash server-side; provide revocation and expiration. Show it once
privately during owner pairing, never in chat, logs or committed configuration.
Creating/persisting that credential is a distinct setup action after code review;
this design does not authorize changing existing credentials.

Limit claim/heartbeat/result frequency and validate claim token, worker ID,
revision, hashes and output size. Owner routes retain existing authentication,
authenticator and same-origin checks. Worker routes use scoped authentication
instead of browser sessions. Market descriptions and filenames are untrusted data.

## Full production costs and price recommendations

Reuse `material-cost-resolver.ts`, `pricing-math.ts` and `ai-center/sales.ts`.
Actual recorded landed purchase averages take priority over dated catalog MSRP
and explicit manual fallback. Do not claim the supplied invoices were imported
without checking their stored records. Record cost source and observation date.

Include sliced material, explicit startup-waste allowance and expected failure
rate; printer time and a configured hourly rate covering wear/electricity;
handling and packaging labor; supply costs; order overhead; channel-specific
fixed, percentage and advertising fees; applicable payment-fee effects of tax;
and configured postage/subsidy. Avoid counting electricity or labor twice.
Missing costs remain unknown, including when a legitimate zero is needed.

Map validated estimates to a reviewable proposed SalesInput. Do not silently
overwrite owner actuals or existing sales settings. Owner acceptance records
the proposal's versions and sources. A model can explain recommendations, but
deterministic calculations enforce the margin and minimum-contribution floors.
Reuse the configured margin target; do not replace the $25 monthly AI cap.

Comparable prices must distinguish physical prints from STL downloads, variants,
quantities, currency and observation date. Preserve item and shipping prices.
Only confirmed equivalent observations enter the existing median calculation;
unknown quantities, currencies and shipping cannot be assumed equivalent. When
delivery costs are unavailable, label the comparison as item-price-only. Keep
existing recency filtering and minimum sample requirement. Competitor asking
prices, shop-wide sales and reviews do not prove item-level sell-through.

Research recommendations must look beyond Etsy: general web/shop observations,
3D-model communities and social trend signals as well as marketplace evidence.
Possible sources include independent shops, other marketplaces, Printables,
MakerWorld and social platforms. These are evidence categories, not claims that
any API or automatic connector is already available. Record date, source URL,
product category, physical/digital format, color intent and signal type. Downloads,
likes, views, reviews and search interest are popularity proxies, not purchases.
Our own orders provide stronger sales evidence; competitor verified item-level
sales are used only when actually available.

Ranking must cover functional and decorative opportunities, trend recency,
competition, suitability for this printer, full cost including color waste, and
original value. Cross-platform evidence is preferable; one viral post cannot
justify a best-seller claim. Use permitted APIs/public information without account
access bypass or unsolicited messages. A broader automated search adapter needs
its own configured, tested provider; this slicing release can consume dated
cross-platform evidence but must not label an Etsy-only collector as web-wide.
The broader collector is a follow-up research integration, with its own plan,
bounded requests and the existing spend approvals before paid calls.

Research recommendations can propose demand tests and original design value.
Use our own paid orders, conversion and returns to assess subsequent results.
Do not clone another seller's geometry or treat a small tweak as proof of rights.
If the sustainable cost floor exceeds comparable prices, suggest a bundle,
different product or no launch; never invent profitability or undercut the floor.
Bundles require their own packing estimate and costs, not the single-item box.

## Packing calculations

Owner supplies catalog records internal and external box dimensions separately,
empty-box tare, protection/insert weight and cost, clearance requirements and
whether a measured sample calibrated the preset. Dimensions and units must be
explicit. Do not seed hypothetical supplies as actual stock.

For one item, test all six axis-aligned orientations plus configured protection
clearance against INTERNAL dimensions. Choose the lowest configured landed
packing cost among fitting available presets, with deterministic size tie-breaks.
For quantities greater than one, require an explicitly calibrated quantity preset
in this MVP; defer arbitrary nesting algorithms. No fitting preset means no
automatic proposal. OUTSIDE dimensions feed carrier data.

Estimated shipping weight includes print mass, explicit print-mass allowance,
box tare and all protection/inserts. Round upward only to the carrier-supported
unit; show both grams and ounces. Never label the result measured. Do not infer
package weight solely from model bounds or convert a slicer estimate into a
physical acceptance test. Owner confirms complete contents/weight/dimensions
before the existing packed-parcel flow accepts the proposal.

## Verification and rollout

Verify Black PLA Basic defaults, outdoor PETG enforcement, required color mapping,
per-filament cost/waste accounting and consumed-versus-shipping mass separation;
multicolor jobs without validated hardware/project profiles must remain blocked.
Verify profile identity/template inheritance, known pilot fixture estimates and
source-hash validation; invalid STL/profile rejection; subprocess timeout and
cleanup; duplicate claims and lease recovery; stale result/revision rejection;
worker scope and anonymous-route denial; zero/missing costs and cost provenance;
margin floors under fees/waste changes; incomparable/stale market data exclusion;
packing orientations, padding, tare, units and rounding; missing/uncalibrated or
multi-item presets; and estimate-to-carrier confirmation boundaries.

Run existing project/release, sales pricing, owner authentication and catalog
shipping regression tests plus build/lint. Demonstrate one real local worker
job with the refined 60 mm STL, show its result in the authenticated dashboard,
then verify replacing the revision invalidates readiness. No real product
publication or live postage is needed for these checks.

Implement on the existing feature branch and prepare the draft PR. Keep the
integration disabled until owner pairing and validation. Production deployment
requires approval for this new release; previous deployment permission is not a
standing authorization. Document environment settings, worker setup, retention,
resource limits, disconnect behavior and remaining cloud-slicing limitations.

## Acceptance and limitations

Success means a leader/owner request produces a durable, inspectable local slice
estimate, a cost-based price proposal and a supplies-based packing proposal,
without a payment or public listing. Existing production orders and shipping
behavior continue working. Computer sleep/offline delays jobs visibly. Exact
physical packing, carrier quotes, new material profiles and unattended Railway
slicing remain distinct verification requirements.

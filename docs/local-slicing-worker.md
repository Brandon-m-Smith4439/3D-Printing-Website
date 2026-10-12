# Local slicing worker

This feature is disabled by default. It queues owner-project STL estimates on
the site and runs Bambu Studio on an awake Windows computer. It does not connect
to or command the printer. Local slicing uses no model API call. Leader drafts,
hosting, postage and email retain their separate budgets and approvals.

## Supported configurations

- X2D, 0.4 mm nozzle, 0.20 mm Standard, Textured PEI Plate.
- Indoor default: Black Bambu PLA Basic. PLA Matte is selectable after its profile
  fingerprint is verified. Outdoor projects require PETG. The current tested PETG
  profile is specifically **Bambu PETG HF**, not interchangeable PETG Basic.
- Colors are explicit project requirements, not a claim that the printer is loaded
  with that filament. Owner must load the selected material/color when printing.
- Multicolor requirements can be recorded and cost math supports material lines.
  Actual multicolor slicing is blocked until compatible hardware, assignments and
  a mapped multipart/painted project are verified. A single STL contains no colors.
- Slices estimate consumed grams and total time. Bambu's current CLI result does
  not reliably separate deposited part mass from purge/tower, so weigh a finished
  part before packing proposals. Measured part mass is stored separately.

## Setup after release approval

1. Deploy the reviewed code with `AI_CENTER_SLICING_ENABLED=false`. Backup all
   existing SQLite databases and sidecars before the additive migration.
2. Install/update Bambu Studio from its official distribution if it is not already
   installed. This pilot used BambuStudio 02.08.02.60. No slicer installation or
   Windows auto-start service is performed by this application.
3. On the local computer, set these environment variables privately in a terminal:

   | Variable | Value |
   | --- | --- |
   | `AI_CENTER_SLICER_SITE_URL` | `https://meshharbor3d.com` |
   | `AI_CENTER_SLICER_EXECUTABLE` | `C:/Program Files/Bambu Studio/bambu-studio.exe` |
   | `AI_CENTER_SLICER_RESOURCES` | `C:/Program Files/Bambu Studio/resources/profiles/BBL` |
   | `AI_CENTER_SLICER_WORK_ROOT` | A dedicated writable local temporary folder |

4. From the repository directory run `node scripts/slicer-worker.mjs --profiles`.
   This prints only fingerprints for trusted resolved presets; no pairing token
   is needed. They include machine template G-code, preserving printer identity.
   Run a local fixture after any slicer/profile update before accepting its new
   fingerprint. Changed fingerprints invalidate previous estimates.
5. Enable `AI_CENTER_SLICING_ENABLED=true` on the site only with deployment/setup
   approval. Open `/owner/business`, select the project, expand **Print estimates,
   materials and packing → Local worker setup and packing supplies**, and save
   the verified profile fingerprints. Blank fingerprints disable those profiles.
6. Choose **Pair local worker**. Copy its one-time token privately into
   `AI_CENTER_SLICER_WORKER_TOKEN` on the local computer. Do not paste it in chat,
   a command-line argument, commit, screenshot or public environment file.
   Persisting credentials beyond this private terminal session is an owner setup
   decision; the application does not save your token on the local computer.
7. Run `node scripts/slicer-worker.mjs`. Keep the computer awake. Stop with Ctrl+C.
   It polls every 30 seconds and handles one slice at a time. The dashboard shows
   last seen/offline status. Pairing expires after 30 days; revoke it in the same
   panel whenever the computer should lose access. Pair again privately afterward.

The worker cannot read buyer addresses, configure prices, publish, send outreach,
use paid model credentials or buy postage. Its asset download is limited to the
current claimed revision. HTTPS is required; localhost HTTP is supported only
for isolated tests with `AI_CENTER_SLICER_ALLOW_LOCALHOST=true`.

## Owner workflow

Save intended use, exact material cost SKU and color assignments before clicking
**Leader: estimate print**. An outdoor PLA choice is rejected server-side. Unknown
use, unverified profiles and unconfigured multicolor stay blocked. The action
queues a deterministic local task; free-text leader messages still create draft
plans rather than automatically executing arbitrary tools.

Changing material or required colors preserves historical test records but requires a new physical-test confirmation before release. Failed/cancelled jobs have an explicit owner retry control; restarting the worker alone does not reset exhausted attempts. Automatic sliced-cost recommendations currently cover single physical units; bundles need separate costing review. Recorded material-price changes invalidate linked costs even while the worker is disabled. Accept the current slice estimate after reviewing the profile/revision and any
warnings. This does not create a passing physical test. Record finished-part
weight separately after weighing the actual piece. Add your actual box supplies:
inside/outside dimensions, tare, protection weight, clearance, cost and calibrated
quantity. There are no fabricated stock presets. More than one item requires a
tested quantity-specific arrangement; general nesting is not implemented.

Configure explicit full costs and channel fees in existing Sales preparation.
Then enter an explicit allowance for additional startup waste not already included
by the slicer (including 0 when appropriate) and request a proposal. Material costs
use posted invoice purchase averages first, dated catalog references second and
manual fallback last. Missing sources/costs stay unknown. Review the proposal,
then **Accept reviewed cost estimates** to save the computed material/time/packing
costs. Changed proposal data requires another review. No price or listing is
published by this action.

For a paid physical order, **Prefill packing estimate** is available only when
the order quantity/revision matches a current accepted estimate and calibrated
supplies. Mixed physical-product orders need manual packing. Verify actual packed
weight and outside dimensions before **Confirm measured package**. Prefill does
not obtain rates, approve postage or mark an order shipped. Rate edits retain the
existing version/expiration and exact-amount approval rules.

## Recovery and limits

Each process has a three-minute timeout and runs in a private temporary directory.
The directory and generated G-code are removed afterward. Queue claims last five
minutes, with one automatic retry; failures remain visible. Offline computers
delay work rather than fabricating activity. Restart the worker after checking
setup; cancelled/stale jobs cannot update accepted estimates. A changed model or
material selection invalidates accepted readiness.

State lives in the existing AI-center database. Include it in normal SQLite-aware
backups along with its WAL/SHM sidecars. At most 500 job records and 50 pairing
records are supported by this MVP; no automatic destructive pruning runs. Contact
the developer for a reviewed archive migration before exceeding those bounds.
Do not delete the database to clear a queue: it contains other business records.

## Verification recorded 2026-10-12

Real isolated CLI checks used the same refined 60 mm STL, SHA256
`6ca7fda1f8d6e8cee2445d882d31c2016c96727a2b980fa894e9fefacfd9dc51`:

| Profile | Consumed grams | Estimated seconds | Fingerprint |
| --- | ---: | ---: | --- |
| Black PLA Basic | 6.87210 | 1202.55 | `f716a30e1b653c4f0356284f9b65b6c3fcfe6c803a4e6d70842506c90c78dad6` |
| PETG HF | 6.76742 | 1322.22 | `2a3841eed38aa35c1220f2eac39e28252393efd05e1b8160369a8e934b2648e8` |

An actual local worker also completed a website-enqueued task, downloaded the
exact asset, returned its estimate and lost access after test-credential revocation.
Packing tests used explicitly synthetic weights/boxes, not real packaging. These
are slicing estimates, not physical printing verification or a live carrier test.
Unattended Railway slicing, multicolor output, the owner's actual supplies and
production pairing remain unverified. Broad online trend collection beyond the
existing Etsy adapter is a separate integration; drafts can assess dated evidence
from other sources but have no automatic web-wide browsing tool in this release.

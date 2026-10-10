# Etsy research setup and current limitations

The code is disabled by default. The owner has no registered Etsy developer app yet. App registration/approval, secrets, callback registration, an owner OAuth grant, and live verification are outstanding. No Etsy calls, listings or fees were incurred during implementation.

## Owner setup

1. Open [Etsy app registration](https://www.etsy.com/developers/register). Describe a private owner tool for MeshHarbor3D that reads shop sales and observes public product listings. Follow Etsy's app review and access requirements. Personal app access or marketplace-search restrictions can differ; approval is an external blocker, not something this code bypasses.
2. In [Your Apps](https://www.etsy.com/developers/your-apps), obtain the approved app keystring and shared secret. Register the exact HTTPS callback: `https://YOUR-SITE/api/owner/marketplace/callback`, using the same canonical origin as `NEXT_PUBLIC_SITE_URL`. Do not use an Apple login token. Etsy requires its own OAuth grant.
3. Configure these private server environment variables. Do not put secrets in source or `NEXT_PUBLIC_*` fields:

   - `ETSY_ENABLED=false` until app/configuration review; set `true` explicitly to authorize reads.
   - `ETSY_APP_KEY`: approved Etsy keystring.
   - `ETSY_SHARED_SECRET`: Etsy app shared secret. The API header is `keystring:shared_secret`.
   - `ETSY_REDIRECT_URI`: precisely registered callback above, no query/hash or trailing slash.
   - `ETSY_EXPECTED_SHOP_NAME=MeshHarbor3D`: OAuth user must own this shop.
   - `MARKETPLACE_TOKEN_KEY`: private random 32-byte key encoded as 64 hexadecimal characters. Owner must generate/store this secret; implementation did not change credentials. Back it up securely. Loss prevents decrypting tokens; replacement requires reauthorization. No key rotation UI is provided.
   - `MARKETPLACE_DATABASE_PATH`: optional persistent private SQLite file. Default: `marketplace.sqlite` beside the business DB. Must differ from business and AI center DBs. Mount the same file/volume for API and standalone worker. SQLite files, WAL and backups contain encrypted tokens and sanitized observations and need restricted filesystem access.
   - `ETSY_WRITES_ENABLED=false`: listing writes remain off. Enable only after an approved code/deployment review, current Etsy fee-policy review and app access. Every publication still requires a separate exact owner approval.
   - `ETSY_RESEARCH_ENABLED=false`: optional daily research remains off by default.
   - `ETSY_RESEARCH_KEYWORDS`: 1–10 comma-separated phrases, each at most 120 characters. When explicitly enabled, one phrase rotates per daily attempt, with one page of at most 25 listings.

4. Sign in to the owner dashboard, select **Authorize Etsy read access**, and approve only `shops_r listings_r transactions_r` in Etsy. No write scope is requested. The callback clears authorization parameters from browser history and exchanges the code in an authenticated same-origin POST, so the existing strict owner cookie need not be relaxed. Complete within ten minutes and the same owner session.
5. Request a narrow own-shop sales window and one market observation. Verify returned source/date, your shop identity, units, currency and truncation against Etsy. Review current app quota/access. These live checks have not been performed.

## What the implementation does

OAuth state is random, session-bound, expiring and consumed atomically before exchange; PKCE verifiers and tokens are encrypted with AES-256-GCM. Access/refresh token values never reach owner API responses or activity logs. Shop identity is checked before tokens persist and before token reuse/refresh. A disconnect generation prevents an in-flight exchange or refresh from resurrecting authorization. Refresh runs only during an explicitly requested shop operation and is guarded against concurrent token rotation. API calls use fixed HTTPS Etsy hosts, reject redirects, time out, bound response sizes, strip buyer fields and do not automatically retry. Read requests are serialized and separated by at least 30 seconds. Failed daily attempts count toward the durable daily limit.

The standalone worker can call `runMarketplaceResearch()` from `lib/marketplace/research.ts`. No database transaction spans network I/O. Persisted `marketplace_leases.last_at` is the last attempt marker; a crash does not permit immediate repeat. Observation failures are recorded without upstream error bodies. The hook performs one official API read, no paid model/search-tool call. The $25 monthly AI ledger remains separate; this adapter has no API billing purchase executor.

Market observations contain keyword search results, listed prices and favorites where returned. They do not contain verified competitor item sales, a bestseller ranking or demand forecasts. Listing descriptions are untrusted source material and are not automatically fed to agents. The owner can select **Review & attach to a project**, inspect/edit a summary of at most 2,000 characters containing source/date, numeric observations and proxy limitations, then explicitly attach it as evidence using the current project version. Raw listing titles/descriptions are omitted from these agent-facing summaries. No review scraping, third-party trend subscription or arbitrary URL ingestion is implemented.

Own-shop rankings aggregate transaction quantities from paid, non-canceled receipts in the specified window. Reads stop at three pages/300 receipts and show truncation explicitly. They deduplicate transaction IDs. Item gross is grouped by currency and excludes shipping, tax and fees; refunds are flagged but not deducted. These figures are neither net revenue nor profit and are not joined to Mesh Harbor revenue. Live API payload compatibility and reconciliation remain unverified. Disconnect removes local tokens; revoke the app in Etsy to invalidate Etsy-issued credentials.

Manual Etsy listing export requires a current passing physical test, a prepared release package, and an owner-approved listing draft for the exact current project version. It publishes nothing. Exports flag missing photos, taxonomy, shipping/processing/returns settings and current fees. Physical Etsy stock is **not allocated or synchronized**: an owner must reserve separate Etsy units before listing to avoid selling storefront stock twice. Digital exports reference an existing tested STL.

## Optional exact-listing publication

After explicit deployment approval and configuring `ETSY_WRITES_ENABLED=true`, select **Authorize Etsy listing write access**. This separate PKCE grant adds only `listings_w` to the existing read scopes; the write-mode choice is bound to the expiring OAuth challenge. Default read authorization never requests write access. App registration/approval is still required.

The publication panel prepares a private immutable preview without external writes. It requires the exact current passed print revision and independently approved listing draft, original design/license declarations, an owner-uploaded JPEG/PNG photo under 8 MB and the existing tested STL under 20 MB. Physical listings require existing Etsy taxonomy, shipping-profile, processing/readiness-profile and return-policy IDs, set up accurately in Etsy by the owner. The smallest supported release has **one separately allocated unit**, a USD shop and no variations. Digital listings upload the exact tested STL and omit physical profiles. Private publication assets have a 50 MB aggregate sidecar quota. Signature/dimension checks reject unsupported images; actual Etsy image acceptance remains unverified.

Review the exact title, description plus license, approved release price, profiles, photo/file hashes and fee policy. Confirm **Approve fee spending & publish this exact listing** for that preview. The server rechecks project version/approval and authorizations, records a durable claim, creates one draft, uploads the photo and digital file where applicable, and requests activation. No background job invokes these writes. Preview approvals expire after 30 minutes. The API exposes no price update, restock, automatic renewal, deletion, payment/refund or message executor.

Etsy currently documents a standard USD $0.20 initial listing fee, with additional applicable taxes, currency conversion and sales/payment/advertising fees. [Review Etsy's current fee policy](https://www.etsy.com/legal/fees/) before approving. Quantity is one and automatic renewal at expiration is disabled. There is no replenishment executor. The application cannot cap Etsy's actual platform billing; listing fees are separately approved and are outside the $25 AI API ledger. Own-shop fees and account billing must still be reconciled in Etsy.

Any failed/invalid/unknown response after the write claim is retained as **uncertain** with known listing ID and step. A crash can leave **running**, which also requires manual reconciliation. These packages are never automatically retried, including if draft creation may have succeeded without returning its ID. Check Etsy drafts/live listings and fees before taking further action. The application does not auto-delete drafts or issue refunds. A returned `active` status is provider confirmation only; verify the real listing, asset contents and fees manually. Live app access, image/file upload acceptance, profiles, activation and fee reconciliation have not been tested; no external writes occurred during implementation.

## Official references and isolated verification

- [Etsy authentication and PKCE](https://developers.etsy.com/documentation/essentials/authentication/)
- [API request requirements](https://developers.etsy.com/documentation/essentials/requests/)
- [API endpoint reference](https://developers.etsy.com/documentation/reference)
- [Listing workflow](https://developers.etsy.com/documentation/tutorials/listings/)

`tests/marketplace.test.mjs` uses mocked responses explicitly identified as fixtures, an isolated temporary sidecar, and fake credentials. It checks session binding, PKCE, state expiry/replay, encryption/redaction, refresh/identity/config changes, disconnect races, pagination/deduplication bounds, hostile URL mapping, daily failure cooldown and tested/current-version export gating. `tests/marketplace-publication.test.mjs` verifies default-off writes, exact preview and fee approval, single-unit constraints, physical create/image/activate and digital upload mock paths, write-scope PKCE and unknown-outcome retention/no retry. Neither exercises an approved Etsy app or live account. Root validation adds HTTP owner/CSRF checks and the shared build before publishing the PR.

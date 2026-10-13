# Mesh Harbor launch candidate

This is a review branch. No production deployment, real AI call, checkout, Etsy listing, refund or outreach has been performed. Launch is not authorized by preparing this code.

## Owner setup before launch

1. Print and inspect an original project revision. Record the actual material, printer, time, grams and pass/fail in the project. Failed prints stay in that project as measured feedback for a new revision. Structural STL checks alone never count as a passing print.
2. Supply actual product photos, prices, direct costs, licenses/instructions, finished stock, shipping and return policies. Reserve separate physical stock for website and Etsy. There is no shared cross-channel inventory synchronization.
3. Register an Etsy developer app and approve its access as described in [ETSY_SETUP.md](ETSY_SETUP.md). Browser login is separate. External approval and a live authorization check remain outstanding.
4. Add billing to a dedicated OpenAI API project, create a private project key and configure `AI_CENTER_OPENAI_API_KEY` in the approved deployment environment. ChatGPT Business seats do not pay for these server API calls. Confirm current model prices in the provider account, enter those prices in the dashboard, and retain the $25 monthly total limit. Business and role caps are ceilings within that total. Templates and the original tray generator are free. Each paid job still requires spending approval. Railway, Etsy, Stripe, materials and shipping are separate costs.
5. Configure a separate Stripe sandbox and the dedicated signed `/api/store/webhook` with `COMMERCE_STRIPE_WEBHOOK_SECRET`. Exercise actual sandbox success, abandonment, webhook replay, refunds and digital downloads before live checkout. The connected Stripe account is live; implementation used isolated fixtures instead. Review tax registrations and shipping destinations/rate before enabling checkout.
6. Review the PR and staging evidence, then approve deployment and specific product publication. Public catalog, checkout, Etsy writes, worker and daily research are disabled by default. No live listing is created by approving an AI draft.

## Railway deployment configuration after explicit approval

Use Node >=22.16 (24 recommended), `npm ci`, `npm run build`, `npm run start`. The launcher always starts Next and optionally starts the worker when `AI_CENTER_WORKER_ENABLED=true`. Both run in the same container, with the same environment and persistent `/data` volume. Keep one replica. A separate Railway service with its own volume cannot share these SQLite queues. The launcher stops both children when either fails so Railway can restart the service; it does not silently restart paid jobs.

The existing service is attached to `main`, has one replica, a 500MB `/data` volume, and `/api/health`. These settings were inspected without mutation. Existing quote/order/customer records are read-only to the AI metrics adapter. Commerce and marketplace adapters use separate sidecars. Review environment names in `.env.example`; never commit values or send keys in chat.

Initial recommended flags: `AI_CENTER_WORKER_ENABLED=false`, `AI_CENTER_COORDINATOR_ENABLED=false`, `ETSY_RESEARCH_ENABLED=false`, `ETSY_WRITES_ENABLED=false`, `COMMERCE_CATALOG_ENABLED=false`, `COMMERCE_CHECKOUT_ENABLED=false`. Enable deliberately after staging checks. Low-cost model choices currently supported are `gpt-4.1-mini` and `gpt-4o-mini`; provider/model adapters are configurable within the reviewed allowlist. Arbitrary model tools and generated-code execution are absent.

## Private storage and recovery

The business database and AI, commerce and marketplace database paths must be distinct. AI assets have an aggregate 100MB default quota; commerce copies have a separate 100MB quota; Etsy publication assets have a 50MB quota. These ceilings do not reserve disk space. Existing files, WAL journals and backups also consume the 500MB volume. Monitor actual capacity before stocking many projects.

`node scripts/backup-control-center.mjs` creates SQLite-consistent snapshots of existing sidecars and a checksum manifest. The owner backup endpoint performs the same operation. `CONTROL_CENTER_BACKUPS_ENABLED=true` adds a daily worker snapshot; it requires the worker to run. One completed local snapshot is retained. These are individually consistent database snapshots, not a transaction across all databases. Stop web/worker writes for a coordinated export/restore. The existing business backup process remains separate.

Export backups to secure off-site storage; a copy on the same volume does not protect against volume loss. Protect marketplace backups and preserve `MARKETPLACE_TOKEN_KEY` separately. Restore only with all writers stopped, verify checksum manifests and SQLite integrity, and preserve the current files before replacement. There is no automatic off-site backup or restore UI. Changing the encryption key requires Etsy reauthorization.

## Verification boundaries

Local tests cover budget/claim concurrency, project version/test gates, stock reservations, signed-payment matching and replay, cross-account downloads, OAuth PKCE/state/encryption, bounded API payloads, and no automatic retry for uncertain publication outcomes. Fixtures are not real sales or actual physical tests. Build/lint/test results are reported separately with exact counts.

Production dependency audit is clear at preparation time after patch updates. Development lint tooling still has five high advisories; no forced downgrade was used. Dynamic SQLite paths produce Next tracing warnings. Review staging bundle size and startup on Railway before release.

Market search position/favorites are demand proxies, not verified competitor sales. Own Etsy rankings require authorized receipt reads and can be truncated; gross item sales exclude shipping, taxes, fees and refund deductions. Existing Mesh metrics have their documented provenance, and are not bank-reconciled net profit. Generic PDF/ZIP digital products, arbitrary businesses, automatic general CAD generation, shipping-label purchases and fully unattended cross-channel operations remain outside this small MVP.

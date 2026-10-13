# Storefront, Meshy and isolated checkout testing

Primary shopping navigation is Products, STL Files, Custom Printing and Gallery, with account and cart controls on the right. Cart changes update the badge in this browser and other open tabs. Website products require a current tested release and separate catalog approval. Default gallery samples are labeled illustrative; owner-uploaded work retains its descriptions.

## Meshy workflow

Describe an original decorative model, approve one generation (20 credits), review the private file and free advisory analysis, import a structurally valid revision, slice and physically print, record feedback, then prepare and review the sale package. Future generation requests approximately 12,000 triangular faces; the provider's actual count can differ. Imports retain the 1 MB / 20,000 triangle structural checks.

An original generation can request one explicit 5-credit remesh or one 10-credit repair, each requiring spending approval. The monthly cap remains 30 credits by default. A 20-credit generation followed by a 5-credit remesh leaves 5 credits, insufficient for a 10-credit repair. Historical child jobs remain repairs. Oversized or invalid files remain private and display an import-blocking reason. Download and simplify/repair manually when necessary, then upload a new revision. A new revision invalidates prior print-test and release approval. Analysis is advisory; no model is automatically declared printable or published.

Official references: https://docs.meshy.ai/en/api/text-to-3d , https://docs.meshy.ai/en/api/remesh , https://docs.meshy.ai/en/api/pricing . Check current provider prices before changing caps.

## Disposable checkout sandbox

Use a separate Railway service, with no production volume and distinct absolute DATABASE_PATH, AI_CENTER_DATABASE_PATH, COMMERCE_DATABASE_PATH and MARKETPLACE_DATABASE_PATH under `/sandbox-data/`. Set COMMERCE_SANDBOX_FIXTURE=true and a privately generated COMMERCE_SANDBOX_PASSWORD (16+ characters). Use only a Stripe `sk_test_` or `rk_test_` key. The fixture refuses live keys, production `/data` paths, duplicate database files, enabled workers, email, Etsy, AI provider keys or shipping credentials. It marks legacy migration complete to avoid copying the repository's legacy JSON into the test database.

Start command: `node --experimental-strip-types scripts/seed-commerce-sandbox.mjs && npm start`. Use the usual Node 22.16+ build. Fixture seed is idempotent and creates one explicitly synthetic, original tray product with $1 physical and $1 STL prices, 100 fake physical units, synthetic passed test, and a verified `testcustomer@example.invalid` account. No email is sent. Sign in using the private sandbox password. These are fake assumptions, not business evidence. A visible TEST ONLY banner and no-index metadata identify the sandbox. The database is ephemeral unless separately persisted; redeployment resets it. Never run this fixture on the main service.

For isolated tests set COMMERCE_CATALOG_ENABLED=true, COMMERCE_CHECKOUT_ENABLED=true, COMMERCE_TAX_REVIEWED=true (test fixture assumption only), COMMERCE_AUTOMATIC_TAX=false, COMMERCE_SHIPPING_COUNTRIES=US, COMMERCE_SHIPPING_RATE_CENTS=50, STRIPE_LIVE_ENABLED=false, NEXT_PUBLIC_SITE_URL to the sandbox HTTPS hostname. Configure a dedicated test-mode `/api/store/webhook` and its own private COMMERCE_STRIPE_WEBHOOK_SECRET. Enable checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired, checkout.session.async_payment_failed and charge.refunded. Do not change the main site's quote webhook.

Verify: anonymous checkout blocked; verified sign-in; physical+STL cart; Stripe test payment success and decline; actual signed webhook marks paid; physical stock reduces once; purchased STL downloads; another account cannot download; duplicate event leaves stock unchanged; full sandbox refund revokes downloads; abandoned/expired checkout frees holds. Local fixtures alone do not prove provider delivery. Record actual results separately.

## Launch limitations

Real catalog checkout remains disabled until real product photos, prices, license, website-only inventory, shipping rates and seller tax review are approved. Etsy color themes require Etsy Plus; free banner branding does not require a subscription. Etsy API integration still requires developer approval, private server keys and owner OAuth. Etsy layout is controlled by Etsy. Legal return policies, seller status and processing times must reflect the owner's actual business. No agent publishes, sends outreach, raises budgets or initiates live refunds.

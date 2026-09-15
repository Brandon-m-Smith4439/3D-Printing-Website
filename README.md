# LayerCraft 3D — Website Starter (V0.65)

A security-conscious 3D printing showcase, custom-request/quote workflow, customer account area, live production queue, payment-deposit flow, and private owner dashboard.

## V0.65 packaging/build repair

V0.65 fixes an incremental-update packaging issue that could leave `lib/request-priority.ts` (and potentially other source files from earlier revisions) missing when a user updated by extracting only changed-files ZIPs. The full V0.64 baseline already contained the priority module; the failure was in the incremental update chain rather than the import itself.

For this revision, the **changed-files ZIP is intentionally a repair-safe source overlay**. It contains the complete application source/configuration/static baseline but excludes runtime/private data such as `data/*.json`, SQLite databases, `.env.local`, `storage/`, `.next/`, `node_modules/`, generated backups, and uploaded customer content. Extracting it over an existing V0.64/V0.63 working copy restores all required source modules without replacing live requests, customers, queue state, or private uploads.

After updating, stop the development server, delete `.next` if it exists, and restart `Start-3DPrintingWebsite.bat`. If dependencies are already installed, a clean `npm run build` is the best verification.

## What V0.64 adds

- Formal owner quotes with total price, automatically calculated 50% deposit, material, dimensions, estimated-ready date, notes, and customer-facing terms.
- Customer quote review in `/profile`. Verified customers must explicitly approve the exact stored quote revision and terms before payment is enabled.
- Quote approval stores the approval timestamp, customer account, revision, and an immutable snapshot of the approved terms.
- Stripe-hosted Checkout integration for the required 50% deposit. Payment-card details never pass through this Next.js application.
- Signed Stripe webhook handling verifies the raw request signature and confirms amount/currency against the stored quote before recording the deposit.
- Production queue eligibility is gated on a confirmed deposit. A quote approval alone does not start production.
- Secure Forgot Password flow using random, single-use, expiring tokens stored only as hashes.
- SQLite persistence using Node's built-in `node:sqlite`, with automatic one-time migration from the V0.63 JSON stores.
- Private customer attachments moved behind a private-storage abstraction outside `public/`.
- Owner audit log for important account, quote, payment, request, queue, login, and backup events. Client IPs are stored only as salted hashes.
- Owner Security & Backups page with automatic daily snapshots, manual snapshots, retention, SQLite backup, and private-file backup.
- Verified customer email ownership can safely link older unclaimed guest requests that used that exact email address.
- Paid/production records cannot be permanently deleted from the owner API, protecting payment/accounting history.
- Node.js 22.5+ is enforced by the Windows launcher because V0.64 uses the built-in SQLite module.

## Local Windows startup

1. Install Node.js **22.5 or newer**. Current Node 22 LTS is recommended.
2. Double-click `Start-3DPrintingWebsite.bat`.
3. On first run the launcher creates `.env.local` from `.env.example` and runs `npm install`.
4. Open `http://localhost:3000`.
5. Keep the launcher open; press `Ctrl+C` to stop the site.

Manual startup:

```powershell
npm install
npm run dev
```

Production compiler check:

```powershell
npm run build
```

## V0.64 custom-order lifecycle

The website now separates a request, an accepted quote, payment, and production:

```text
CUSTOM REQUEST
    ↓
New / Reviewing
    ↓
Owner prepares quote
    ↓
QUOTE SENT
    ↓
Customer reviews exact price + terms
    ↓
APPROVE QUOTE & TERMS
    ↓
50% DEPOSIT DUE
    ↓
Stripe-hosted Checkout
    ↓
DEPOSIT CONFIRMED
    ↓
Owner adds job to production queue
    ↓
Queued → Preparing → Printing → Finishing → Ready → Completed
```

A customer approving a quote does **not** authorize the site to treat the job as in production. The owner can add it to production only after the deposit is recorded.

## Formal quote workflow

Open **Owner → Production**, expand a customer request, and use **Formal quote**.

A quote stores:

- total price
- required 50% deposit (calculated automatically)
- remaining balance
- material
- dimensions
- estimated-ready date
- customer-facing notes
- terms the customer must approve
- quote revision
- sent/approved/deposit timestamps

When a sent quote is revised, the prior customer approval is cleared and the customer must approve the new revision. A deposit-paid quote is locked so the exact paid/agreed terms cannot be silently edited.

Guest requests can have a draft quote, but a quote cannot be sent to a profile until the request is linked to a verified customer account. If a guest later creates and verifies an account using the same request email, the verified ownership can safely link matching unclaimed guest requests.

## Customer quote acceptance

The customer sees active quotes under `/profile`. Before approving, the site requires a verified customer email and the exact account attached to that request.

Approval records:

- customer account ID
- approval timestamp
- quote revision
- exact price/deposit/balance
- material and dimensions
- estimated date
- notes
- exact terms text

This gives you a durable record of what the customer actually accepted.

## Stripe deposit payments

V0.64 supports Stripe Checkout for the 50% custom-order deposit.

Set in `.env.local` / your production secret manager:

```env
NEXT_PUBLIC_SITE_URL=https://your-final-domain.example
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Configure Stripe to send relevant Checkout events to:

```text
https://your-final-domain.example/api/payments/stripe/webhook
```

The application currently reacts to successful Checkout payment events. The webhook:

1. reads the raw request body
2. verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`
3. identifies the quote through Stripe metadata
4. verifies the amount and currency against the stored quote
5. records the deposit once
6. changes the request to `Deposit paid`
7. writes an audit event
8. makes the job eligible for owner queue placement

Checkout creation also uses an idempotency key tied to the quote/revision to reduce accidental duplicate Checkout-session creation.

### Local payment testing

If Stripe is not configured and `NODE_ENV` is not production, the deposit button uses a clearly marked local-development simulation and does **not** charge a real card.

Production refuses to simulate payment.

## Forgot Password

Customers can choose **Forgot Password** on `/login`.

The flow:

1. customer enters an email
2. the API always returns a generic response so account existence is not revealed
3. if a verified account exists, a random password-reset token is created
4. only a SHA-256 hash of that token is stored
5. the emailed token expires after 30 minutes and is single-use
6. resetting the password rotates the account session version, invalidating previous sessions

The reset page is `/reset-password` and is intended to be reached through the email link.

## Email verification and guest-request claiming

Account verification tokens remain random, single-use, time-limited, and hash-stored. Sensitive account changes require verified email ownership.

V0.64 improves the earlier privacy model: an unverified account still cannot claim prior requests merely because its email text matches. **After the email address is actually verified**, unclaimed guest requests submitted to that exact address may be linked to the verified account. This allows a legitimate guest customer to create an account later without exposing request history to an unverified impostor.

## Database

V0.64 migrates application records into SQLite:

```text
data/3d-printing-business.sqlite
```

The path can be changed with:

```env
DATABASE_PATH=
```

The database stores logical collections for:

- requests
- queue jobs
- customer accounts/password hashes
- notifications
- verification/reset-token records
- customer-upload metadata
- site content
- quotes
- audit history

### V0.63 JSON migration

On first database initialization, existing V0.63 JSON records are imported when the corresponding SQLite collection is empty. Keep a backup of the V0.63 folder before your first V0.64 launch.

Do not run multiple unrelated copies of the site against the same SQLite file over a network share. SQLite is appropriate for this small-business deployment when the app runs as one server process against private persistent local storage. If you later scale to multiple application servers, migrate the storage adapter to managed PostgreSQL.

## Private customer file storage

Customer attachments are no longer treated as public assets. The default private root is:

```text
storage/private/
```

Override it with:

```env
PRIVATE_STORAGE_DIR=
```

This directory **must not** be inside `public/`.

Customer attachments are retrievable only through owner-authenticated routes. Existing V0.63 private attachments are copied into the new private-storage layout when needed.

For a hosted single-server deployment, place this directory on access-controlled persistent storage. For a future multi-server/cloud deployment, replace the private-storage adapter with a private object-store provider rather than using a shared public directory.

## Customer attachment malware protection

The request form supports up to three files, 10 MB each:

- PNG
- JPEG/JPG
- WebP
- STL
- 3MF

Production uploads fail closed unless configured malware scanning accepts the file:

```env
CUSTOMER_UPLOAD_SCANNER=clamav
CLAMSCAN_PATH=clamscan
```

The upload path also checks size, extension, signature bytes, randomizes storage names, and re-encodes supported browser images to strip ordinary image metadata. No scanner can prove a model harmless; keep slicer software patched and treat customer STL/3MF files as untrusted data.

## Audit log

**Owner → Security & Backups** shows recent audit events.

The audit log covers important actions including:

- owner/customer login activity that the app records
- account/profile/password/email changes
- password-reset requests/completion
- quote save/send/approval
- deposit checkout/payment confirmation
- request status/deletion
- queue updates/removal
- backup creation

Raw client IP addresses are not written to the audit table. A short salted hash is recorded instead. Configure a production-only salt:

```env
AUDIT_IP_SALT=use-a-long-random-value
```

The audit log is capped to prevent unbounded growth. Treat it as an operational record, not as a substitute for your hosting provider's security logs.

## Backups

The default backup root is:

```text
backups/
```

Configure:

```env
BACKUP_DIR=
BACKUP_RETAIN_COUNT=14
```

A backup contains:

- a SQLite-consistent database snapshot
- a copy of the private file store when private files exist

The owner dashboard checks for a daily backup and can create a manual snapshot. Old snapshots are rotated according to the retention count.

**Important:** V0.64 does not invent its own encryption scheme. Put `BACKUP_DIR` on private, access-controlled persistent storage and enable the host/volume provider's encryption-at-rest. For disaster recovery, also replicate backups off the application machine using your hosting/storage provider and periodically test restoring a copy before relying on it.

## Owner/admin access

The dashboard is `/owner`. Rapidly click/tap the small site logo five times to open `/login?admin=1`. The hidden gesture is only a convenience; the owner password and signed HTTP-only owner session are the security controls.

Before production set strong unique values for:

```env
OWNER_PASSWORD=
OWNER_SESSION_SECRET=
CUSTOMER_SESSION_SECRET=
```

Do not reuse these secrets.

## Production board and record retention

Deposit-paid requests can be placed at the end of the production queue and then reordered with Earlier/Later or an exact queue position.

Paid, queued, and completed request records cannot be permanently deleted through the owner API. This intentionally preserves the quote/payment/audit trail. Unpaid requests can still be declined or permanently deleted. If a paid customer order needs to be canceled, handle the refund/financial resolution and retain the business record rather than erasing it.

## 50/50 terms

The public Custom Request page explains that:

- the initial request is not itself an order or payment
- the final scope/quote must be confirmed first
- 50% is required before production
- the remaining 50% is due before shipment or at pickup/delivery handoff
- cancellation after materials/work begin may cause some or all of the deposit to be applied to material, machine time, and completed work, subject to the accepted terms and applicable law

Have your final Terms of Service, cancellation/refund language, warranty limitations, and local tax/business language reviewed for your jurisdiction before launch.

## Environment variables added/used in V0.64

```env
DATABASE_PATH=
PRIVATE_STORAGE_DIR=
BACKUP_DIR=
BACKUP_RETAIN_COUNT=14
AUDIT_IP_SALT=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Existing production settings still include Turnstile, Resend, site URL, owner session secrets, customer session secret, and ClamAV configuration. See `.env.example`.

## Production deployment notes

The current V0.64 persistence model is designed for a **single persistent application server/VM/container**. Do not deploy the SQLite database or private file directory to an ephemeral filesystem that may disappear between requests or deployments.

For a larger future deployment, the storage modules are deliberately isolated so SQLite can be replaced by managed PostgreSQL and the private filesystem adapter by private S3-compatible/object storage.

## Recommended production checklist

- Set the final business identity, shop links, domain, and contact/privacy information.
- Use Node.js 22.5+.
- Put SQLite, private storage, and backups on persistent private storage.
- Enable host/volume encryption-at-rest and off-machine backup replication.
- Configure a strong `AUDIT_IP_SALT` and unique session secrets.
- Configure Cloudflare Turnstile and provider/WAF rate limiting.
- Configure Resend and verify the sending domain.
- Configure ClamAV (or replace the scanner adapter with a managed scanning service) and verify production uploads fail closed.
- Configure Stripe live keys and the signed webhook endpoint; test Stripe's test mode before using live mode.
- Keep Stripe/Resend/Turnstile keys only in the host secret manager, never source control.
- Finish Terms of Service, refunds/cancellations, acceptable-use/manufacturing restrictions, privacy policy, material/tolerance disclaimers, and shipping terms.
- Run `npm audit`, `npm run build`, and complete customer/owner/payment/queue tests before launch.
- Test backup restoration and customer-file recovery periodically.
- Keep Next.js/React/Node, ClamAV, your OS, and slicer software patched.

No website can eliminate all attack or fraud risk. V0.64 reduces the exposed surface, keeps card entry off-site, preserves approval/payment history, gates production on deposit confirmation, and adds recovery/audit controls, but secure hosting and disciplined business processes still matter.

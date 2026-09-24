# Mesh Harbor 3D Owner Platform Roadmap

**Baseline:** v0.86, commit `faf05aff4dc4ec965ebb9b0baa5e7f315b1253ed`

**Goal:** Evolve the owner area from a production list into a business operations console while preserving the current request, quote, payment, production, email, backup, security, and shipping behavior.

## Release sequence

### v0.87 — Operations Center
The owner dashboard opens to a dedicated Operations Center by default. It summarizes the current state of the business and tells the owner what needs attention without requiring manual scanning of every request.

Required behavior:
- Default owner tab is Operations Center.
- Show counts for urgent, action-needed, monitoring, new requests, active production, final balances due, and completed work.
- Surface actionable items for:
  - new requests not yet reviewed;
  - quotes awaiting owner action after a counter/decline;
  - sent quotes waiting on customer response for too long;
  - approved quotes with an unpaid or incomplete deposit;
  - deposit-paid requests not yet added to production;
  - active production jobs with overdue estimated-ready dates;
  - Ready jobs with an unpaid or failed final invoice;
  - failed/void/uncollectible final invoices;
  - shipping records in failure/review-required/return-to-sender states;
  - stale backups.
- Show integration health summaries for Stripe, EasyPost, backups, and recent audit failures without exposing secrets.
- Global owner search across request code, customer name/email/phone, queue code/title, invoice number, and tracking code.
- Clicking an attention item or search result takes the owner to the relevant production request and expands it.
- EasyPost being unconfigured while approval is pending should show as informational/warning status, not an emergency.
- Existing Production, Site Content, and Security & Backups tabs remain available.

### v0.88 — Owner Security
Add authenticator-app TOTP two-factor authentication, one-time recovery codes, security event history, session-hardening controls, and backup verification. Preserve password login as the first factor. Do not weaken current signed HttpOnly/Secure/SameSite session behavior.

### v0.89 — Customer Follow-up Automation
Add rate-limited automated reminders for quotes awaiting customer response, unpaid deposits, stale customer-response requests, and unpaid final invoices. Respect verified-email status and email preferences. Maintain per-reminder cooldowns and maximum send counts. Show reminder history and next eligibility to the owner.

### v0.90 — Pricing & Profitability
Add owner-only cost estimation for material, filament grams, machine hours, labor/post-processing, packaging, payment fees, and shipping cost. Calculate expected gross profit and margin without exposing internal costs to customers. Add saved quote templates and safe quote duplication/reuse.

### v0.91 — Repeat Business & Gallery Conversion
Add “Make Another / Reorder” from completed customer requests and “Request something like this” from Gallery. Prefill stable descriptive fields and references while deliberately not copying stale quote amounts, payment state, deadlines, or production state.

### v0.92 — Policy & Launch Readiness
Add customer-facing cancellation/refund, custom-work/payment, model/IP responsibility, print-tolerance, pickup/delivery/shipping policy pages or sections. Add an owner launch-readiness console for Stripe, Resend, ClamAV, backups, webhooks, production health, and EasyPost. Stripe and EasyPost live-mode transitions remain explicit owner-approved actions only.

## Global constraints
- GitHub `main` is source of truth before every release.
- Each release gets a focused feature branch and increments the app version by 0.01.
- Run `npm ci`, `npm run lint`, and `npm run build` before merge.
- UI changes must be visually inspected at 320, 390, 430, 650, 720, 721, 1024, 1440, 1920, 2560, and 3440px where relevant.
- Preserve the 720px mobile breakpoint unless a later requirement explicitly changes it.
- Preserve SQLite on the Railway persistent volume.
- Preserve all auth, upload validation, rate limiting, ClamAV scanning, webhook validation, and proxy protections.
- Do not switch Stripe or EasyPost to live mode without explicit approval.
- Do not purchase a real shipping label without explicit approval.
- Do not expose owner, Stripe, Resend, EasyPost, session, or webhook secrets.

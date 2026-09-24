# v0.88 Owner Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticator-app 2FA, one-time recovery codes, session revocation, security-event visibility, and verifiable backups to the Mesh Harbor owner area without weakening existing password, origin, cookie, audit, or deployment protections.

**Architecture:** Persist owner-security state in the existing SQLite collection store as a singleton. Password login remains the first factor; when 2FA is enabled it issues a short-lived signed challenge cookie, and a second endpoint verifies TOTP or a recovery code before creating the normal owner session. Owner session tokens gain a generation number so “sign out other sessions” can invalidate older cookies. TOTP secrets are encrypted at rest; recovery codes are stored only as keyed hashes. Backup verification opens the snapshot read-only and runs SQLite quick-check plus private-file presence checks.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node crypto, SQLite, Railway, existing owner audit log, qrcode package for authenticator-app enrollment QR.

**Spec:** `docs/superpowers/specs/2026-09-24-owner-platform-roadmap.md`

## Global Constraints

- Baseline is v0.87, commit `c7f2b9073274dcd56a5e14c26bc33342c7418ee7`.
- Release version becomes `0.88.0`.
- Owner password remains required as first factor.
- TOTP setup must not enable 2FA until a valid code from the new secret is confirmed.
- TOTP secret must not be stored plaintext in SQLite.
- Recovery codes are shown once and stored only as keyed hashes.
- A used recovery code is permanently removed.
- Existing signed HttpOnly/Secure/SameSite=Strict owner cookie behavior is preserved.
- Session revocation must invalidate previously issued owner sessions across deploys by using persistent session generation.
- All protected owner routes must check the persistent session generation.
- Existing same-origin validation remains on state-changing owner routes.
- Backup verification must be read-only and must not restore or mutate production data.
- No Stripe/EasyPost live-mode mutation is part of this release.
- Required release validation: npm ci, lint, build, owner password-only login when 2FA is off, 2FA challenge when on, valid/invalid TOTP, one-time recovery code use, session revocation, backup verification, and responsive owner/login screenshots.

## Review Focus

1. Legacy v0.87 owner cookies: must either validate as generation 1 or fail safely without bypassing revocation.
2. Clock skew: TOTP accepts only the current 30-second window plus one adjacent window on each side.
3. Recovery replay: a recovery code used once must fail on the second attempt.
4. Secret persistence: API responses after enablement must never return the encrypted/raw TOTP secret.
5. Session revocation: old sessions must fail after generation increments while the current owner can receive a fresh replacement cookie.

---

### Task 1: Security State, TOTP, Recovery Codes, and Session Generations

**Files:**
- Create: `lib/owner-security.ts`
- Create: `lib/owner-totp.ts`
- Modify: `lib/owner-auth.ts`
- Modify: `lib/database.ts`
- Modify: `.github/workflows/validate.yml`

- [ ] Add failing CI assertions for a v2 owner session generation mismatch and deterministic TOTP verification.
- [ ] Add `owner-security` to database collections.
- [ ] Implement owner security singleton with encrypted pending/enabled TOTP secrets, recovery hashes, enrollment timestamps, and `sessionGeneration`.
- [ ] Implement RFC 6238 SHA-1 6-digit TOTP with 30-second steps and ±1-window validation.
- [ ] Implement recovery-code generation and keyed hashing.
- [ ] Change owner session token format to include generation and a nonce while still accepting legacy generation-1 tokens until generation advances.
- [ ] Make `requestIsOwner` asynchronous and validate cookie generation against persisted state.
- [ ] Run the focused security assertions green.
- [ ] Commit: `V0.88 add owner 2FA security primitives`.

### Task 2: Migrate Owner Routes to Persistent Session Validation

**Files:**
- Modify every `app/api/owner/**/route.ts` that calls `requestIsOwner`.

- [ ] Add a failing CI check showing a generation-revoked cookie can still access one protected route before migration.
- [ ] Change every protected owner route from `requestIsOwner(request)` to `await requestIsOwner(request)`.
- [ ] Confirm GET and mutation routes compile and retain same-origin checks where already present.
- [ ] Re-run owner API regression checks.
- [ ] Commit: `V0.88 enforce revocable owner sessions across routes`.

### Task 3: Password + Second-Factor Login Flow

**Files:**
- Modify: `app/api/owner/login/route.ts`
- Create: `app/api/owner/login/verify/route.ts`
- Modify: `components/LoginPanel.tsx`
- Modify: `app/globals.css`
- Modify: `.github/workflows/validate.yml`

- [ ] Add failing CI browser/API tests: password must return `requiresSecondFactor` when enabled; wrong TOTP fails; correct TOTP succeeds; used recovery code cannot be reused.
- [ ] Add short-lived HttpOnly Strict challenge cookie signed with owner session secret and bound to session generation.
- [ ] Password route issues challenge instead of owner session when 2FA is enabled.
- [ ] Verification route accepts `code`, checks TOTP then recovery code, removes used recovery code, writes audit events, sets owner session, clears challenge.
- [ ] Update owner login UI to transition from password to authenticator/recovery input without exposing whether 2FA exists before password validation.
- [ ] Add “Use a recovery code” toggle and return-to-password option.
- [ ] Run login API/browser tests green.
- [ ] Commit: `V0.88 require owner second factor at login`.

### Task 4: Owner Security Management UI

**Files:**
- Create: `app/api/owner/security/route.ts`
- Create: `app/api/owner/security/2fa/setup/route.ts`
- Create: `app/api/owner/security/2fa/enable/route.ts`
- Create: `app/api/owner/security/2fa/recovery/route.ts`
- Create: `app/api/owner/security/2fa/disable/route.ts`
- Create: `app/api/owner/security/sessions/revoke/route.ts`
- Modify: `components/OwnerSecurityPanel.tsx`
- Modify: `app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Add failing CI test for security status and setup endpoints.
- [ ] Add `qrcode` dependency and generate QR data URL server-side from `otpauth://totp/Mesh%20Harbor%203D:Owner?...issuer=Mesh%20Harbor%203D`.
- [ ] Setup route returns QR + manual secret only for pending enrollment.
- [ ] Enable route verifies TOTP and returns 10 recovery codes exactly once.
- [ ] Recovery regeneration requires a current TOTP code and replaces all previous codes.
- [ ] Disable route requires owner password plus current TOTP or unused recovery code, disables 2FA, clears secrets/codes, increments session generation, and refreshes current session.
- [ ] Session revoke route increments generation and refreshes only the current session.
- [ ] Security panel shows 2FA status, QR/manual enrollment, recovery-code one-time display/download-copy controls, recovery count, enrolled date, and “Sign out other owner sessions”.
- [ ] Security event section filters owner login/2FA/recovery/session events from audit log.
- [ ] Responsive browser validation at 320, 390, 720, 721, 1440, 3440.
- [ ] Commit: `V0.88 add owner 2FA management and session controls`.

### Task 5: Backup Verification

**Files:**
- Modify: `lib/backups.ts`
- Create: `app/api/owner/backups/verify/route.ts`
- Modify: `components/OwnerSecurityPanel.tsx`
- Modify: `.github/workflows/validate.yml`

- [ ] Add failing CI test against a real generated backup.
- [ ] Add `verifyBackup(name)` that rejects unsafe names, opens the snapshot read-only, runs `PRAGMA quick_check`, confirms required tables, records byte size, and checks private storage directory presence when expected.
- [ ] Verification route is owner-only, same-origin protected, audited, and returns no file contents.
- [ ] Security panel adds Verify button and latest verification result.
- [ ] Run backup verification tests green.
- [ ] Commit: `V0.88 verify backup snapshots before restore is ever needed`.

### Task 6: Version, Full Regression, Review, Merge, Deploy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Review all v0.88 files.

- [ ] Set version to `0.88.0`.
- [ ] Run full GitHub validation: npm ci, lint, build, origin checks, 3MF scanning path, Stripe final-invoice flow, Operations Center flow, all v0.88 auth/recovery/revocation/backup checks, responsive visual matrix.
- [ ] Review branch for bypasses, plaintext secrets, recovery replay, route migration omissions, and accidental secret logging.
- [ ] Create/review PR `V0.88 add owner two-factor security`.
- [ ] Squash merge only when validation is green.
- [ ] Wait for Railway production terminal `SUCCESS`.
- [ ] Verify runtime starts as `mesh-harbor-3d@0.88.0`, persistent /data volume remains attached, and no new 500/fatal errors appear.
- [ ] Report commit, deployment, tests, and any remaining issues.

## Self-Review

- All v0.88 roadmap items are covered: TOTP, recovery codes, security events, revocable sessions, backup verification.
- No production secret is returned after 2FA enablement.
- Recovery codes have explicit replay tests.
- Every protected owner route is included in the async-auth migration task.
- Backup verification is read-only.
- Existing payment/shipping systems are not mutated.

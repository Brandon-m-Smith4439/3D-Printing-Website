"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "@/lib/audit-log";
import { easyPostDiagnosticNoticeKind } from "@/lib/easypost-mode";

type BackupInfo = { name: string; createdAt: string; databaseBytes: number; includesPrivateFiles: boolean };
type BackupVerification = {
  name: string;
  healthy: boolean;
  quickCheck: string;
  databaseBytes: number;
  requiredTables: string[];
  privateFilesExpected: boolean;
  privateFilesPresent: boolean;
  verifiedAt: string;
};
type StripeStatus = {
  keyConfigured: boolean;
  webhookConfigured: boolean;
  mode: "test" | "live" | "unconfigured";
  operationalMode: "test" | "live-locked" | "live" | "unconfigured";
  liveEnabled: boolean;
  businessCallsAllowed: boolean;
  siteOrigin: string;
  secureOrigin: boolean;
  webhookUrl: string;
  checkoutReady: boolean;
  productionReady: boolean;
};
type ShippingStatus = {
  configured: boolean;
  credentialMode: "unconfigured" | "test" | "production";
  mode: "unconfigured" | "test" | "production-locked" | "production";
  liveEnabled: boolean;
  businessCallsAllowed: boolean;
  readiness: "unconfigured" | "test-incomplete" | "test-ready" | "production-locked" | "production-incomplete" | "production-ready";
  fromAddressConfigured: boolean;
  webhookSecretConfigured: boolean;
  autoBuyLabels: boolean;
  webhookUrl: string;
  originLabel: string;
};
type EasyPostDiagnostic = {
  connected: boolean;
  credentialMode: "test" | "production" | "unconfigured";
  operationalMode: "unconfigured" | "test" | "production-locked" | "production";
  webhookFound: boolean;
  webhookDisabled: boolean;
  expectedWebhookUrl: string;
  checkedAt: string;
  message: string;
};
type SecurityStatus = {
  twoFactorEnabled: boolean;
  recoveryCodesRemaining: number;
  recoveryCodesGeneratedAt: string;
  enrolledAt: string;
  lastRecoveryUsedAt: string;
  sessionGeneration: number;
  pendingEnrollment: boolean;
};
type SetupPayload = { manualSecret: string; otpauthUri: string; qrDataUrl: string; expiresInMinutes: number };
type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

function securityEvent(entry: AuditEntry) {
  return /^owner-(login|password|2fa|recovery|sessions)/.test(entry.action);
}

export function OwnerSecurityPanel({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [shipping, setShipping] = useState<ShippingStatus | null>(null);
  const [shippingDiagnostic, setShippingDiagnostic] = useState<EasyPostDiagnostic | null>(null);
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryTotp, setRecoveryTotp] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState("");
  const [verificationByName, setVerificationByName] = useState<Record<string, BackupVerification>>({});

  const securityEvents = useMemo(() => audit.filter(securityEvent).slice(0, 30), [audit]);

  async function load() {
    const [a, b, p, s, securityResponse] = await Promise.all([
      fetch("/api/owner/audit", { cache: "no-store" }),
      fetch("/api/owner/backups", { cache: "no-store" }),
      fetch("/api/owner/payments/status", { cache: "no-store" }),
      fetch("/api/owner/shipping/status", { cache: "no-store" }),
      fetch("/api/owner/security", { cache: "no-store" }),
    ]);
    if (a.ok) {
      const j = await a.json() as { entries?: AuditEntry[] };
      setAudit(j.entries || []);
    }
    if (b.ok) {
      const j = await b.json() as { backups?: BackupInfo[] };
      setBackups(j.backups || []);
    }
    if (p.ok) {
      const j = await p.json() as { stripe?: StripeStatus };
      setStripe(j.stripe || null);
    }
    if (s.ok) {
      const j = await s.json() as { shipping?: ShippingStatus };
      setShipping(j.shipping || null);
    }
    if (securityResponse.ok) {
      const j = await securityResponse.json() as { security?: SecurityStatus };
      setSecurity(j.security || null);
    }
  }

  useEffect(() => { void load(); }, []);

  async function postJson<T>(url: string, payload?: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const result = await response.json() as T & { message?: string };
    if (!response.ok) throw new Error(result.message || "Request could not be completed.");
    return result;
  }

  async function testShippingConnection() {
    setBusy("shipping-test");
    try {
      const response = await fetch("/api/owner/shipping/test", { method: "POST" });
      const result = await response.json() as { diagnostic?: EasyPostDiagnostic; message?: string };
      if (result.diagnostic) setShippingDiagnostic(result.diagnostic);
      if (!response.ok || !result.diagnostic) {
        throw new Error(result.diagnostic?.message || result.message || "Could not test EasyPost.");
      }
      onNotice({ kind: easyPostDiagnosticNoticeKind(result.diagnostic), text: result.diagnostic.message });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not test EasyPost." });
    } finally {
      setBusy("");
    }
  }

  async function backup() {
    setBusy("backup");
    try {
      const result = await postJson<{ backup?: BackupInfo }>("/api/owner/backups");
      onNotice({ kind: "success", text: result.message || "Secure backup snapshot created." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create backup." });
    } finally {
      setBusy("");
    }
  }

  async function verifyBackupSnapshot(name: string) {
    setBusy(`verify:${name}`);
    try {
      const result = await postJson<{ verification: BackupVerification }>("/api/owner/backups/verify", { name });
      setVerificationByName((current) => ({ ...current, [name]: result.verification }));
      onNotice({ kind: result.verification.healthy ? "success" : "warning", text: result.message || "Backup verification complete." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not verify backup." });
    } finally {
      setBusy("");
    }
  }

  async function startTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("2fa-setup");
    try {
      const result = await postJson<SetupPayload>("/api/owner/security/2fa/setup", { password: setupPassword });
      setSetup(result);
      setSetupPassword("");
      setSetupCode("");
      setRecoveryCodes([]);
      onNotice({ kind: "success", text: "Authenticator setup started. Scan the QR code, then confirm a code from your app." });
      await load();
    } catch (error) {
      setSetupPassword("");
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not start two-factor setup." });
    } finally {
      setBusy("");
    }
  }

  async function enableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("2fa-enable");
    try {
      const result = await postJson<{ security: SecurityStatus; recoveryCodes: string[] }>("/api/owner/security/2fa/enable", { code: setupCode });
      setSecurity(result.security);
      setRecoveryCodes(result.recoveryCodes || []);
      setSetup(null);
      setSetupCode("");
      onNotice({ kind: "success", text: "Two-factor authentication is enabled. Save the recovery codes now." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not enable two-factor authentication." });
    } finally {
      setBusy("");
    }
  }

  async function regenerateRecoveryCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("recovery");
    try {
      const result = await postJson<{ security: SecurityStatus; recoveryCodes: string[] }>("/api/owner/security/2fa/recovery", { code: recoveryTotp });
      setSecurity(result.security);
      setRecoveryCodes(result.recoveryCodes || []);
      setRecoveryTotp("");
      onNotice({ kind: "success", text: "New recovery codes generated. Every previous recovery code is now invalid." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not regenerate recovery codes." });
    } finally {
      setBusy("");
    }
  }

  async function revokeOtherSessions() {
    setBusy("sessions");
    try {
      const result = await postJson<{ security: SecurityStatus }>("/api/owner/security/sessions/revoke");
      setSecurity(result.security);
      onNotice({ kind: "success", text: result.message || "Other owner sessions signed out." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not revoke other owner sessions." });
    } finally {
      setBusy("");
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("2fa-disable");
    try {
      const result = await postJson<{ security: SecurityStatus }>("/api/owner/security/2fa/disable", {
        password: disablePassword,
        code: disableCode,
      });
      setSecurity(result.security);
      setDisablePassword("");
      setDisableCode("");
      setRecoveryCodes([]);
      setSetup(null);
      onNotice({ kind: "warning", text: "Two-factor authentication disabled. Other owner sessions were signed out." });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not disable two-factor authentication." });
    } finally {
      setBusy("");
    }
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice({ kind: "success", text: success });
    } catch {
      onNotice({ kind: "warning", text: "Could not copy automatically. Select the value manually." });
    }
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes.length) return;
    const body = [
      "Mesh Harbor 3D owner recovery codes",
      "Each code works once. Store these somewhere private and offline.",
      "",
      ...recoveryCodes,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mesh-harbor-3d-owner-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="owner-security-grid">
    <section className="owner-panel owner-two-factor-panel">
      <div className="owner-panel-heading">
        <div><p className="eyebrow">OWNER SECURITY</p><h2>Two-factor authentication</h2></div>
        <button className="text-button" type="button" onClick={() => void load()}>Refresh</button>
      </div>
      <p className="owner-panel-intro">Protect the owner dashboard with your password plus a rotating code from an authenticator app. Recovery codes are one-time emergency access keys.</p>

      {!security ? <div className="queue-empty compact"><strong>Checking owner security…</strong></div> : <>
        <div className="owner-security-status-grid">
          <article className={security.twoFactorEnabled ? "is-ready" : "is-warning"}>
            <span>Authenticator app</span>
            <strong>{security.twoFactorEnabled ? "Enabled" : "Not enabled"}</strong>
            <small>{security.twoFactorEnabled && security.enrolledAt ? `Enabled ${new Date(security.enrolledAt).toLocaleDateString()}` : "Add a second factor before taking live payments."}</small>
          </article>
          <article className={security.recoveryCodesRemaining >= 5 ? "is-ready" : security.twoFactorEnabled ? "is-warning" : ""}>
            <span>Recovery codes</span>
            <strong>{security.twoFactorEnabled ? `${security.recoveryCodesRemaining} remaining` : "Not generated"}</strong>
            <small>{security.lastRecoveryUsedAt ? `Last used ${new Date(security.lastRecoveryUsedAt).toLocaleString()}` : "Each recovery code works once."}</small>
          </article>
          <article className="is-ready">
            <span>Session generation</span>
            <strong>{security.sessionGeneration}</strong>
            <small>Older sessions are invalidated whenever this number advances.</small>
          </article>
        </div>

        {!security.twoFactorEnabled && !setup && <form className="owner-security-action-card" onSubmit={startTwoFactor}>
          <div><strong>Set up an authenticator app</strong><span>Confirm the owner password before Mesh Harbor reveals the one-time enrollment secret. Works with Microsoft Authenticator, Google Authenticator, 1Password, Authy, and other standard TOTP apps.</span></div>
          <label><span>Confirm owner password</span><input type="password" value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} autoComplete="current-password" maxLength={200} required /></label>
          <button className="button button-small" type="submit" disabled={busy === "2fa-setup"}>{busy === "2fa-setup" ? "Starting…" : "Set Up 2FA"}</button>
        </form>}

        {setup && <div className="owner-2fa-enrollment">
          <div className="owner-2fa-qr"><img src={setup.qrDataUrl} alt="Authenticator app QR code" /></div>
          <div className="owner-2fa-enrollment-copy">
            <strong>1. Scan this QR code</strong>
            <span>Open your authenticator app and add a new account. If scanning is unavailable, enter the secret manually.</span>
            <code>{setup.manualSecret}</code>
            <button className="text-button" type="button" onClick={() => void copyText(setup.manualSecret, "Authenticator setup secret copied.")}>Copy manual secret</button>
            <form className="owner-security-inline-form" onSubmit={enableTwoFactor}>
              <label><span>2. Confirm the 6-digit code</span><input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000" required /></label>
              <button className="button button-small" type="submit" disabled={busy === "2fa-enable"}>{busy === "2fa-enable" ? "Verifying…" : "Enable Two-Factor"}</button>
            </form>
            <small>This enrollment expires in about {setup.expiresInMinutes} minutes. 2FA is not enabled until the code is confirmed.</small>
          </div>
        </div>}

        {recoveryCodes.length > 0 && <div className="owner-recovery-reveal">
          <div><strong>Save these recovery codes now</strong><span>They will not be shown again after you dismiss this list. Each one works once.</span></div>
          <div className="owner-recovery-code-grid">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
          <div className="owner-security-button-row">
            <button className="button button-secondary button-small" type="button" onClick={() => void copyText(recoveryCodes.join("\n"), "Recovery codes copied.")}>Copy Codes</button>
            <button className="button button-secondary button-small" type="button" onClick={downloadRecoveryCodes}>Download .txt</button>
            <button className="text-button" type="button" onClick={() => setRecoveryCodes([])}>I saved them</button>
          </div>
        </div>}

        {security.twoFactorEnabled && <div className="owner-security-management-grid">
          <form className="owner-security-action-card" onSubmit={regenerateRecoveryCodes}>
            <div><strong>Generate new recovery codes</strong><span>Enter a current authenticator code. All existing recovery codes will immediately stop working.</span></div>
            <label><span>Authenticator code</span><input value={recoveryTotp} onChange={(event) => setRecoveryTotp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="000000" required /></label>
            <button className="button button-secondary button-small" type="submit" disabled={busy === "recovery"}>{busy === "recovery" ? "Generating…" : "Generate New Codes"}</button>
          </form>

          <form className="owner-security-action-card owner-danger-card" onSubmit={disableTwoFactor}>
            <div><strong>Disable two-factor authentication</strong><span>This requires both the owner password and a current authenticator or unused recovery code. Other owner sessions will be signed out.</span></div>
            <label><span>Owner password</span><input type="password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} autoComplete="current-password" maxLength={200} required /></label>
            <label><span>Authenticator or recovery code</span><input value={disableCode} onChange={(event) => setDisableCode(event.target.value)} autoComplete="one-time-code" maxLength={24} required /></label>
            <button className="button button-secondary button-small" type="submit" disabled={busy === "2fa-disable"}>{busy === "2fa-disable" ? "Disabling…" : "Disable 2FA"}</button>
          </form>
        </div>}

        <div className="owner-security-action-card owner-session-card">
          <div><strong>Sign out other owner sessions</strong><span>Immediately invalidates every older owner-dashboard cookie while keeping this browser signed in.</span></div>
          <button className="button button-secondary button-small" type="button" disabled={busy === "sessions"} onClick={() => void revokeOtherSessions()}>{busy === "sessions" ? "Signing out…" : "Sign Out Other Sessions"}</button>
        </div>
      </>}
    </section>

    <section className="owner-panel owner-security-events-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">SECURITY EVENTS</p><h2>Owner access history</h2></div><button className="text-button" type="button" onClick={() => void load()}>Refresh</button></div>
      <p className="owner-panel-intro">Owner sign-ins, failed second-factor attempts, recovery-code use, 2FA changes, and session revocations are recorded with a privacy-preserving IP hash.</p>
      <div className="audit-list">{securityEvents.length === 0 ? <div className="queue-empty compact"><strong>No owner security events yet.</strong></div> : securityEvents.map((item) => <article key={item.id}><div><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString()} • {item.action}</small></div><span>{item.ipHash || "system"}</span></article>)}</div>
    </section>

    <section className="owner-panel owner-payment-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">PAYMENTS</p><h2>Stripe payments & invoicing</h2></div><button className="text-button" type="button" onClick={() => void load()}>Refresh</button></div>
      <p className="owner-panel-intro">Customers pay the 50% deposit on Stripe-hosted Checkout, then receive a Stripe-hosted invoice for the remaining balance when production is marked Ready. Secret keys stay server-side.</p>
      {!stripe ? <div className="queue-empty compact"><strong>Checking Stripe configuration…</strong></div> : <>
        <div className="stripe-status-grid">
          <article className={stripe.keyConfigured ? "is-ready" : "is-missing"}><span>Server key</span><strong>{stripe.keyConfigured ? "Configured" : "Missing"}</strong><small>{stripe.mode === "test" ? "Sandbox / test mode" : stripe.mode === "live" ? (stripe.liveEnabled ? "Live key + gate enabled" : "Live key configured · gate locked") : "Add STRIPE_SECRET_KEY"}</small></article>
          <article className={stripe.webhookConfigured ? "is-ready" : "is-missing"}><span>Webhook signing</span><strong>{stripe.webhookConfigured ? "Configured" : "Missing"}</strong><small>{stripe.webhookConfigured ? "Signed events can be verified" : "Add STRIPE_WEBHOOK_SECRET"}</small></article>
          <article className={stripe.secureOrigin ? "is-ready" : "is-warning"}><span>Public site URL</span><strong>{stripe.secureOrigin ? "HTTPS ready" : "Local / not HTTPS"}</strong><small>{stripe.siteOrigin}</small></article>
          <article className={stripe.productionReady ? "is-ready" : "is-warning"}><span>Go-live status</span><strong>{stripe.productionReady ? "Ready for live payments" : stripe.operationalMode==="live-locked" ? "Live key locked" : stripe.checkoutReady ? "Testing available" : "Setup incomplete"}</strong><small>{stripe.productionReady ? "Live key + webhook + HTTPS + explicit live gate" : stripe.operationalMode==="live-locked" ? "STRIPE_LIVE_ENABLED is off, so new real charges and invoices are blocked." : "Finish the checklist before real charges"}</small></article>
        </div>
        <div className="stripe-webhook-box"><div><span>Webhook endpoint</span><code>{stripe.webhookUrl}</code></div><button className="button button-secondary button-small" type="button" onClick={() => void copyText(stripe.webhookUrl, "Stripe webhook URL copied.")}>Copy URL</button></div>
        <div className="stripe-setup-note"><strong>Recommended sequence</strong><span>Keep Stripe in test mode while validating both the 50% deposit and final-balance invoice flow. Before live use, make sure Stripe Invoicing is enabled for the account, the webhook receives invoice.paid and invoice.payment_failed, and then switch to a live restricted key only with explicit approval, then enable STRIPE_LIVE_ENABLED as the final controlled gate.</span></div>
      </>}
    </section>

    <section className="owner-panel owner-payment-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">SHIPPING</p><h2>EasyPost rates, labels & tracking</h2></div><button className="text-button" type="button" onClick={() => void load()}>Refresh</button></div>
      <p className="owner-panel-intro">EasyPost supplies USPS, UPS, and FedEx rates, label purchasing, and carrier tracking. Customer addresses stay private and shipping credentials stay in server environment variables.</p>
      {!shipping ? <div className="queue-empty compact"><strong>Checking EasyPost configuration…</strong></div> : <>
        <div className="stripe-status-grid">
          <article className={shipping.readiness === "test-ready" || shipping.readiness === "production-ready" ? "is-ready" : shipping.readiness === "unconfigured" ? "is-missing" : "is-warning"}>
            <span>EasyPost API</span>
            <strong>{shipping.credentialMode === "test" ? "Test key" : shipping.mode === "production-locked" ? "Live key locked" : shipping.credentialMode === "production" ? "Live key" : "Missing"}</strong>
            <small>{shipping.readiness === "test-ready" ? "Test workflow ready" : shipping.readiness === "production-ready" ? "Production workflow ready" : shipping.readiness === "production-locked" ? "Real shipping blocked by safety lock" : shipping.configured ? "Setup still needs attention" : "Add EASYPOST_API_KEY"}</small>
          </article>
          <article className={shipping.fromAddressConfigured ? "is-ready" : "is-missing"}><span>Ship-from address</span><strong>{shipping.fromAddressConfigured ? "Configured" : "Missing"}</strong><small>{shipping.fromAddressConfigured ? shipping.originLabel : "Set it in Site Content"}</small></article>
          <article className={shipping.webhookSecretConfigured ? "is-ready" : "is-warning"}><span>Tracking webhook</span><strong>{shipping.webhookSecretConfigured ? "Signed" : "Not configured"}</strong><small>{shipping.webhookSecretConfigured ? "HMAC verification enabled" : "Add EASYPOST_WEBHOOK_SECRET before production"}</small></article>
          <article className={shipping.mode === "production" && shipping.businessCallsAllowed ? "is-ready" : "is-warning"}>
            <span>Label mode</span>
            <strong>{shipping.mode === "test" ? "Test only" : shipping.mode === "production-locked" ? "Live locked" : shipping.mode === "production" ? "Live enabled" : "Unavailable"}</strong>
            <small>{shipping.autoBuyLabels ? "Automatic label buying is enabled" : "Automatic label buying is off; owner approval remains required"}</small>
          </article>
        </div>
        <div className="stripe-webhook-box">
          <div><span>EasyPost webhook endpoint</span><code>{shipping.webhookUrl}</code></div>
          <div className="stripe-webhook-actions">
            <button className="button button-secondary button-small" type="button" onClick={() => void copyText(shipping.webhookUrl, "EasyPost webhook URL copied.")}>Copy URL</button>
            <button className="button button-secondary button-small" type="button" disabled={busy === "shipping-test"} onClick={() => void testShippingConnection()}>{busy === "shipping-test" ? "Testing…" : "Test EasyPost Connection"}</button>
          </div>
        </div>
        {shippingDiagnostic && <div className="stripe-setup-note"><strong>Connection test</strong><span>{shippingDiagnostic.message} {shippingDiagnostic.webhookFound ? (shippingDiagnostic.webhookDisabled ? "The matching webhook is disabled." : "The matching webhook is active.") : "The expected webhook was not found."} Checked {new Date(shippingDiagnostic.checkedAt).toLocaleString()}.</span></div>}
        <div className="stripe-setup-note"><strong>Label safety</strong><span>{shipping.mode === "test" ? "Test mode is active. No production shipping can be purchased with the current test credential." : shipping.mode === "production-locked" ? "A production key is present, but real rates and labels remain blocked until EASYPOST_LIVE_ENABLED is deliberately enabled." : "Before purchasing a label, Mesh Harbor re-rates the package. Large price increases require owner review instead of silently eating the difference."}</span></div>
      </>}
    </section>

    <section className="owner-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">BACKUPS</p><h2>Database & private files</h2></div><button className="button button-small" disabled={busy === "backup"} onClick={() => void backup()} type="button">{busy === "backup" ? "Creating…" : "Create Backup"}</button></div>
      <p className="owner-panel-intro">A daily snapshot is created when the owner dashboard checks backup status. Manual snapshots include the SQLite database and private customer-upload storage. Verification is read-only and checks SQLite integrity before a backup is ever needed for recovery.</p>
      <div className="backup-list">{backups.length === 0 ? <div className="queue-empty compact"><strong>No backups yet.</strong></div> : backups.map((item) => {
        const verification = verificationByName[item.name];
        return <article key={item.name}>
          <div><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString()}</small>{verification && <small className={verification.healthy ? "backup-verified" : "backup-failed"}>{verification.healthy ? "✓ Verified healthy" : "Verification needs attention"} • {new Date(verification.verifiedAt).toLocaleString()}</small>}</div>
          <span>{(item.databaseBytes / 1024 / 1024).toFixed(2)} MB DB {item.includesPrivateFiles ? "+ private files" : ""}</span>
          <button className="button button-secondary button-small" type="button" disabled={busy === `verify:${item.name}`} onClick={() => void verifyBackupSnapshot(item.name)}>{busy === `verify:${item.name}` ? "Verifying…" : "Verify backup"}</button>
        </article>;
      })}</div>
    </section>

    <section className="owner-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">AUDIT LOG</p><h2>Security & business actions</h2></div><button className="text-button" type="button" onClick={() => void load()}>Refresh</button></div>
      <p className="owner-panel-intro">Sensitive actions are timestamped with the actor and a privacy-preserving hashed IP marker. Raw IP addresses are not stored.</p>
      <div className="audit-list">{audit.length === 0 ? <div className="queue-empty compact"><strong>No audit events yet.</strong></div> : audit.map((item) => <article key={item.id}><div><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString()} • {item.actor} • {item.action}</small></div><span>{item.ipHash || "system"}</span></article>)}</div>
    </section>
  </div>;
}

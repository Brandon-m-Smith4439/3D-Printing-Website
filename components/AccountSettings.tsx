"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SettingsAccount = {
  displayName: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: string;
  preferences: { emailStatusUpdates: boolean; showQueuePosition: boolean };
  createdAt: string;
};

type Notice = { kind: "success" | "error" | "info"; text: string; developmentUrl?: string } | null;

export function AccountSettings() {
  const router = useRouter();
  const [account, setAccount] = useState<SettingsAccount | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/account/settings", { cache: "no-store" });
    if (response.status === 401) { router.push("/login"); return; }
    const result = await response.json() as { account?: SettingsAccount; message?: string };
    if (!response.ok || !result.account) { setNotice({ kind: "error", text: result.message || "Could not load account settings." }); return; }
    setAccount(result.account);
  }
  // Initial account bootstrap only; explicit mutations call load() after they finish.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  async function resendVerification() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/account/verification/request", { method: "POST" });
      const result = await response.json() as { message?: string; developmentUrl?: string };
      if (!response.ok) throw new Error(result.message || "Could not send verification email.");
      setNotice({ kind: "success", text: result.message || "Verification email sent.", developmentUrl: result.developmentUrl });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not send verification email." }); }
    finally { setBusy(false); }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!account) return; setBusy(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/settings/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: form.get("displayName"), emailStatusUpdates: form.get("emailStatusUpdates") === "on", showQueuePosition: form.get("showQueuePosition") === "on" }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not save settings.");
      setNotice({ kind: "success", text: "Account preferences saved." }); await load(); router.refresh();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save settings." }); }
    finally { setBusy(false); }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/settings/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newEmail: form.get("newEmail"), currentPassword: form.get("currentPassword") }) });
      const result = await response.json() as { message?: string; developmentUrl?: string };
      if (!response.ok) throw new Error(result.message || "Could not change email.");
      setNotice({ kind: "success", text: result.message || "Verification sent.", developmentUrl: result.developmentUrl });
      event.currentTarget.reset();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not change email." }); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null); const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword") || ""); const confirm = String(form.get("confirmPassword") || "");
    if (next !== confirm) { setNotice({ kind: "error", text: "New password confirmation does not match." }); setBusy(false); return; }
    try {
      const response = await fetch("/api/account/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: next }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not change password.");
      setNotice({ kind: "success", text: result.message || "Password changed." }); event.currentTarget.reset();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not change password." }); }
    finally { setBusy(false); }
  }

  if (!account) return <div className="owner-loading">Loading account settings…</div>;
  const verified = account.emailVerified;

  return <div className="account-settings-shell">
    <div className="settings-heading"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Profile & security</h1><p>Manage your account details without exposing private request information publicly.</p></div><Link className="button button-secondary button-small" href="/profile">Back to Requests</Link></div>
    {!verified && <div className="verification-banner"><div><strong>Email verification required</strong><span>Verify {account.email} before changing your username, email, password, or notification preferences.</span></div><button className="button button-small" type="button" disabled={busy} onClick={() => void resendVerification()}>Send Verification Email</button></div>}
    {notice && <div className={`settings-notice ${notice.kind}`}><span>{notice.text}</span>{notice.developmentUrl && <a href={notice.developmentUrl}>Open local verification link</a>}</div>}

    <div className="settings-grid">
      <section className="settings-card"><p className="eyebrow">PROFILE</p><h2>Account preferences</h2><form className="account-form" onSubmit={savePreferences}>
        <label><span>Username / display name</span><input name="displayName" defaultValue={account.displayName} minLength={2} maxLength={80} disabled={!verified || busy} required /></label>
        <label className="settings-check"><input name="emailStatusUpdates" type="checkbox" defaultChecked={account.preferences.emailStatusUpdates} disabled={!verified || busy} /><span><strong>Email me status updates</strong><small>Only verified accounts can enable status emails.</small></span></label>
        <label className="settings-check"><input name="showQueuePosition" type="checkbox" defaultChecked={account.preferences.showQueuePosition} disabled={!verified || busy} /><span><strong>Show my queue position</strong><small>Visible only to you while signed in.</small></span></label>
        <button className="button button-small" disabled={!verified || busy} type="submit">Save Preferences</button>
      </form></section>

      <section className="settings-card"><p className="eyebrow">EMAIL</p><h2>Change email</h2><p className="settings-current">Current: <strong>{account.email}</strong> {verified && <span className="verified-pill">Verified</span>}</p><form className="account-form" onSubmit={changeEmail}>
        <label><span>New email</span><input name="newEmail" type="email" autoComplete="email" disabled={!verified || busy} required /></label>
        <label><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" disabled={!verified || busy} required /></label>
        <button className="button button-small" disabled={!verified || busy} type="submit">Verify New Email</button>
      </form><small className="settings-help">Your current email stays active until the new address is verified.</small></section>

      <section className="settings-card"><p className="eyebrow">PASSWORD</p><h2>Change password</h2><form className="account-form" onSubmit={changePassword}>
        <label><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" disabled={!verified || busy} required /></label>
        <label><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} disabled={!verified || busy} required /></label>
        <label><span>Confirm new password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} disabled={!verified || busy} required /></label>
        <button className="button button-small" disabled={!verified || busy} type="submit">Change Password</button>
      </form></section>
    </div>
  </div>;
}

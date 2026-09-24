"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginPanel({ adminMode = false, initialMode = "login" }: { adminMode?: boolean; initialMode?: "login" | "register" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminStep, setAdminStep] = useState<"password" | "second-factor">("password");
  const [adminRecoveryMode, setAdminRecoveryMode] = useState(false);

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = mode === "register"
      ? { displayName: data.get("displayName"), email: data.get("email"), password: data.get("password"), emailStatusUpdates: data.get("emailStatusUpdates") === "on" }
      : { email: data.get("email"), password: data.get("password") };
    try {
      const response = await fetch(`/api/account/${mode === "register" ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not sign in.");
      router.push("/profile"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function submitAdminSecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/owner/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.get("code") }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not verify the second factor.");
      router.push("/owner"); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify the second factor.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/account/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email") }) });
      const result = await response.json() as { message?: string; developmentUrl?: string };
      if (!response.ok) throw new Error(result.message || "Could not request a password reset.");
      setMessage(`${result.message || "Reset instructions sent."}${result.developmentUrl ? ` Local test link: ${result.developmentUrl}` : ""}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not request a password reset."); }
    finally { setBusy(false); }
  }

  async function submitAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/owner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: data.get("password") }) });
      const result = await response.json() as { message?: string; requiresSecondFactor?: boolean };
      if (!response.ok) throw new Error(result.message || "Could not sign in.");
      if (result.requiresSecondFactor) {
        setAdminStep("second-factor");
        setAdminRecoveryMode(false);
        setMessage("");
        return;
      }
      router.push("/owner"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  if (adminMode) {
    return (
      <div className="account-card admin-login-card">
        <p className="eyebrow">ADMIN ACCESS</p>
        <h1>{adminStep === "password" ? "Owner sign in" : "Verify it’s you"}</h1>
        <p>{adminStep === "password"
          ? "This entrance is separate from customer accounts and requires the owner password."
          : adminRecoveryMode
            ? "Enter one unused Mesh Harbor recovery code. Recovery codes work once."
            : "Enter the 6-digit code from your authenticator app."}</p>
        {adminStep === "password" ? <form className="account-form" onSubmit={submitAdmin}>
          <label><span>Owner password</span><input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
          <button className="button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</button>
        </form> : <form className="account-form admin-second-factor-form" onSubmit={submitAdminSecondFactor}>
          <label>
            <span>{adminRecoveryMode ? "Recovery code" : "Authenticator code"}</span>
            <input
              name="code"
              inputMode={adminRecoveryMode ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={adminRecoveryMode ? "MH3D-XXXX-XXXX-XXXX" : "000000"}
              maxLength={adminRecoveryMode ? 19 : 8}
              required
              autoFocus
            />
          </label>
          <button className="button" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify & Open Dashboard"}</button>
          <div className="admin-second-factor-actions">
            <button className="text-button" type="button" onClick={() => { setAdminRecoveryMode((value) => !value); setMessage(""); }}>
              {adminRecoveryMode ? "Use authenticator code" : "Use a recovery code"}
            </button>
            <button className="text-button" type="button" onClick={() => { setAdminStep("password"); setAdminRecoveryMode(false); setMessage(""); }}>
              Start over
            </button>
          </div>
        </form>}
        {message && <div className="form-status error">{message}</div>}
      </div>
    );
  }

  return (
    <div className="account-card">
      <p className="eyebrow">CUSTOMER PROFILE</p>
      <h1>{mode === "login" ? "Welcome back." : mode === "register" ? "Create your profile." : "Reset your password."}</h1>
      <p>{mode === "forgot" ? "Enter your verified email. If an eligible account exists, we’ll send a one-time reset link." : "Keep your custom requests and live production status together in one place."}</p>
      {mode !== "forgot" && <div className="account-mode-tabs">
        <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Sign in</button>
        <button type="button" className={mode === "register" ? "is-active" : ""} onClick={() => { setMode("register"); setMessage(""); }}>Create account</button>
      </div>}
      {mode === "forgot" ? <form className="account-form" onSubmit={submitForgot}>
        <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={160} required /></label>
        <button className="button" type="submit" disabled={busy}>{busy ? "Working…" : "Send Reset Link"}</button>
        <button className="text-button" type="button" onClick={() => { setMode("login"); setMessage(""); }}>Back to sign in</button>
      </form> : <form className="account-form" onSubmit={submitCustomer}>
        {mode === "register" && <label><span>Name</span><input name="displayName" autoComplete="name" minLength={2} maxLength={80} required /></label>}
        <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={160} required /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 10 : 1} maxLength={128} required /></label>
        {mode === "register" && <><small>Use at least 10 characters. After you verify your email, matching guest requests submitted with that email can be securely linked to your profile.</small><label className="settings-check"><input name="emailStatusUpdates" type="checkbox" /><span><strong>Email me status updates</strong><small>You can change this later in Account Settings.</small></span></label></>}
        <button className="button" type="submit" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Sign In" : "Create Profile"}</button>
        {mode === "login" && <button className="text-button login-forgot-link" type="button" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button>}
      </form>}
      {message && <div className="form-status info">{message}</div>}
    </div>
  );
}

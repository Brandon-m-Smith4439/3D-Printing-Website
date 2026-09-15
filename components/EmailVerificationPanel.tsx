"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function EmailVerificationPanel({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const response = await fetch("/api/account/verification/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const result = await response.json() as { message?: string };
        if (cancelled) return;
        if (!response.ok) throw new Error(result.message || "Could not verify email.");
        setState("success");
        setMessage(result.message || "Email verified successfully.");
        router.refresh();
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Could not verify email.");
      }
    }
    if (token) void verify(); else { setState("error"); setMessage("Verification token is missing."); }
    return () => { cancelled = true; };
  }, [token, router]);

  return <div className={`account-card verification-card ${state}`}>
    <p className="eyebrow">ACCOUNT SECURITY</p>
    <h1>{state === "working" ? "Verifying…" : state === "success" ? "Email verified." : "Verification problem"}</h1>
    <p>{message}</p>
    <div className="verification-actions">
      <Link className="button" href="/profile/settings">Account Settings</Link>
      <Link className="button button-secondary" href="/profile">My Requests</Link>
    </div>
  </div>;
}

"use client";

import Script from "next/script";

function configuredSiteKey(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "YOUR_SITE_KEY" || trimmed.startsWith("YOUR_")) return "";
  return trimmed;
}

export function Turnstile() {
  if (process.env.NODE_ENV !== "production") {
    return <p className="form-note local-note">Local testing: bot verification is bypassed. Production still requires Turnstile.</p>;
  }

  const siteKey = configuredSiteKey(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  if (!siteKey) {
    return <p className="form-note warning">Bot verification is temporarily unavailable. Please contact the shop owner.</p>;
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer strategy="afterInteractive" />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-theme="dark"
        data-size="flexible"
        data-action="custom-request"
        data-response-field-name="cf-turnstile-response"
      />
    </>
  );
}

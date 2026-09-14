"use client";

import Script from "next/script";

export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return <p className="form-note warning">Turnstile is not configured yet. Add your site key before production launch.</p>;
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

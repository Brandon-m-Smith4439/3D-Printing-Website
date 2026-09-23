import type { NextRequest } from "next/server";

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

function firstForwarded(value: string | null) {
  return (value || "").split(",")[0]?.trim() || "";
}

export function sameOrigin(request: NextRequest) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return process.env.NODE_ENV !== "production";

  const suppliedOrigin = normalizeOrigin(originHeader);
  if (!suppliedOrigin) return false;

  const allowed = new Set<string>();
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const configuredOrigin = configured ? normalizeOrigin(configured) : "";
  if (configuredOrigin) allowed.add(configuredOrigin);

  // In production, the configured public HTTPS origin is authoritative. Railway can
  // internally represent the request with a different host, which is why comparing
  // only against request.nextUrl.origin caused legitimate custom-domain requests to fail.
  // Forwarded/Host fallbacks are used only when no public origin is configured.
  if (!configuredOrigin || process.env.NODE_ENV !== "production") {
    const forwardedHost = firstForwarded(request.headers.get("x-forwarded-host"));
    const forwardedProto = firstForwarded(request.headers.get("x-forwarded-proto")) || "https";
    if (forwardedHost) {
      const forwardedOrigin = normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
      if (forwardedOrigin) allowed.add(forwardedOrigin);
    }

    const host = firstForwarded(request.headers.get("host"));
    if (host) {
      const protocol = process.env.NODE_ENV === "production" ? "https" : request.nextUrl.protocol.replace(":", "") || "http";
      const hostOrigin = normalizeOrigin(`${protocol}://${host}`);
      if (hostOrigin) allowed.add(hostOrigin);
    }

    const nextOrigin = normalizeOrigin(request.nextUrl.origin);
    if (nextOrigin) allowed.add(nextOrigin);
  }

  return allowed.has(suppliedOrigin);
}

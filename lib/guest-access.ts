import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getStoredRequest } from "@/lib/request-store";
import type { StoredRequest } from "@/lib/request-types";

export const GUEST_REQUEST_COOKIE = "mh3d_guest_request";
const ACCESS_SECONDS = 30 * 24 * 60 * 60;
const SESSION_SECONDS = 7 * 24 * 60 * 60;

type GuestPayload = {
  rid: string;
  code: string;
  eh: string;
  kind: "access" | "session";
  exp: number;
};

function secret() {
  const configured = (process.env.GUEST_REQUEST_SECRET || process.env.CUSTOMER_SESSION_SECRET || "").trim();
  if (process.env.NODE_ENV === "production") return configured.length >= 32 ? configured : "";
  return configured || "development-only-guest-request-secret-123456";
}

function hashEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("base64url");
}

function sign(encoded: string) {
  const key = secret();
  if (!key) throw new Error("Guest request access is not configured.");
  return createHmac("sha256", key).update(encoded).digest("base64url");
}

function encode(payload: GuestPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function parse(token?: string): GuestPayload | null {
  if (!token || !secret()) return null;
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return null;
  const expected = sign(encoded);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GuestPayload;
    if (!payload.rid || !payload.code || !payload.eh || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.kind !== "access" && payload.kind !== "session") return null;
    return payload;
  } catch {
    return null;
  }
}

function payloadFor(request: StoredRequest, kind: GuestPayload["kind"], seconds: number): GuestPayload {
  return {
    rid: request.id,
    code: request.requestCode,
    eh: hashEmail(request.email),
    kind,
    exp: Math.floor(Date.now() / 1000) + seconds,
  };
}

export function createGuestAccessToken(request: StoredRequest) {
  return encode(payloadFor(request, "access", ACCESS_SECONDS));
}

export function createGuestSessionToken(request: StoredRequest) {
  return encode(payloadFor(request, "session", SESSION_SECONDS));
}

export function guestAccessUrl(request: StoredRequest) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://meshharbor3d.com" : "http://127.0.0.1:3000")).replace(/\/$/, "");
  return `${origin}/request/access?token=${encodeURIComponent(createGuestAccessToken(request))}`;
}

async function requestForPayload(payload: GuestPayload | null, requiredKind?: GuestPayload["kind"]) {
  if (!payload || (requiredKind && payload.kind !== requiredKind)) return null;
  const stored = await getStoredRequest(payload.rid);
  if (!stored || stored.requestCode !== payload.code || hashEmail(stored.email) !== payload.eh) return null;
  // Once a linked account is verified, account authentication becomes authoritative.
  if (stored.customerAccountId) {
    const { findCustomerById } = await import("@/lib/customer-store");
    const account = await findCustomerById(stored.customerAccountId);
    if (account?.emailVerifiedAt) return null;
  }
  return stored;
}

export async function requestFromGuestAccessToken(token: string) {
  return requestForPayload(parse(token), "access");
}

export async function guestRequestFromRequest(request: NextRequest) {
  return requestForPayload(parse(request.cookies.get(GUEST_REQUEST_COOKIE)?.value), "session");
}

export async function currentGuestRequest() {
  const store = await cookies();
  return requestForPayload(parse(store.get(GUEST_REQUEST_COOKIE)?.value), "session");
}

export function setGuestRequestCookie(response: NextResponse, request: StoredRequest) {
  response.cookies.set(GUEST_REQUEST_COOKIE, createGuestSessionToken(request), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearGuestRequestCookie(response: NextResponse) {
  response.cookies.set(GUEST_REQUEST_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

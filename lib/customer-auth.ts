import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findCustomerById } from "@/lib/customer-store";
import type { CustomerAccount, CustomerSessionView } from "@/lib/customer-types";

export const CUSTOMER_COOKIE = "lc3d_customer";
const SESSION_SECONDS = 30 * 24 * 60 * 60;

type Payload = { sub: string; ver?: number; exp: number };

function secret() {
  const configured = process.env.CUSTOMER_SESSION_SECRET || "";
  if (process.env.NODE_ENV === "production") {
    if (configured.length < 32 || configured === "replace-with-a-long-random-secret-before-production") return "";
    return configured;
  }
  return configured || "development-only-customer-session-secret";
}

function sign(encoded: string) { return createHmac("sha256", secret()).update(encoded).digest("base64url"); }

function sessionView(account: CustomerAccount): CustomerSessionView {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    emailVerifiedAt: account.emailVerifiedAt || "",
    emailVerified: Boolean(account.emailVerifiedAt),
    preferences: account.preferences,
  };
}

export function createCustomerSession(customerId: string, sessionVersion = 1) {
  if (!secret()) throw new Error("Customer session secret is not configured.");
  const payload: Payload = { sub: customerId, ver: sessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function parseToken(token?: string): Payload | null {
  if (!token || !secret()) return null;
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return null;
  const expected = sign(encoded);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function accountFromToken(token?: string): Promise<CustomerSessionView | null> {
  const payload = parseToken(token);
  if (!payload) return null;
  const account = await findCustomerById(payload.sub);
  if (!account || (payload.ver ?? 1) !== account.sessionVersion) return null;
  return sessionView(account);
}

export async function customerFromRequest(request: NextRequest) {
  return accountFromToken(request.cookies.get(CUSTOMER_COOKIE)?.value);
}

export async function currentCustomer() {
  const store = await cookies();
  return accountFromToken(store.get(CUSTOMER_COOKIE)?.value);
}

export function setCustomerCookie(response: NextResponse, token: string) {
  response.cookies.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearCustomerCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

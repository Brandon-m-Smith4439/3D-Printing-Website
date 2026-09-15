import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const OWNER_COOKIE = "lc3d_owner";
const SESSION_SECONDS = 12 * 60 * 60;

function sessionSecret() {
  const configured = process.env.OWNER_SESSION_SECRET || "";
  if (process.env.NODE_ENV === "production") {
    if (configured.length < 32 || configured === "replace-with-a-long-random-secret-before-production") return "";
    return configured;
  }
  return configured || "development-only-session-secret-change-before-production";
}

export function configuredOwnerPassword() {
  const configured = process.env.OWNER_PASSWORD || "";
  if (process.env.NODE_ENV === "production") {
    if (configured.length < 14 || configured === "local-owner") return "";
    return configured;
  }
  return configured || "local-owner";
}

function signature(expires: string) {
  return createHmac("sha256", sessionSecret()).update(expires).digest("hex");
}

export function createOwnerSession() {
  if (!sessionSecret()) throw new Error("Owner session secret is not configured.");
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expires}.${signature(expires)}`;
}

export function validOwnerSession(token?: string) {
  if (!token || !sessionSecret()) return false;
  const [expires, supplied] = token.split(".");
  if (!expires || !supplied || !/^\d+$/.test(expires)) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expires);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function requestIsOwner(request: NextRequest) {
  return validOwnerSession(request.cookies.get(OWNER_COOKIE)?.value);
}

export function setOwnerCookie(response: NextResponse, token: string) {
  response.cookies.set(OWNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearOwnerCookie(response: NextResponse) {
  response.cookies.set(OWNER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function passwordMatches(input: string, expected: string) {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const OWNER_COOKIE = "lc3d_owner";
export const OWNER_CHALLENGE_COOKIE = "lc3d_owner_challenge";
const SESSION_SECONDS = 12 * 60 * 60;
const CHALLENGE_SECONDS = 5 * 60;

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

function challengeSignature(expires: string, generation: string, nonce: string) {
  return createHmac("sha256", sessionSecret()).update(`challenge:${expires}:${generation}:${nonce}`).digest("hex");
}

export function createOwnerSession() {
  if (!sessionSecret()) throw new Error("Owner session secret is not configured.");
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return `${expires}.${signature(expires)}`;
}

export function createOwnerChallenge(sessionGeneration: number) {
  if (!sessionSecret()) throw new Error("Owner session secret is not configured.");
  const expires = String(Math.floor(Date.now() / 1000) + CHALLENGE_SECONDS);
  const generation = String(Math.max(1, Math.floor(sessionGeneration || 1)));
  const nonce = cryptoRandomToken();
  return `v1.${expires}.${generation}.${nonce}.${challengeSignature(expires, generation, nonce)}`;
}

function cryptoRandomToken() {
  return createHmac("sha256", sessionSecret()).update(`${Date.now()}:${Math.random()}:${process.pid}`).digest("hex").slice(0, 24);
}

export function validOwnerChallenge(token: string | undefined, expectedGeneration: number) {
  if (!token || !sessionSecret()) return false;
  const [version, expires, generation, nonce, supplied] = token.split(".");
  if (version !== "v1" || !expires || !generation || !nonce || !supplied) return false;
  if (!/^\d+$/.test(expires) || !/^\d+$/.test(generation)) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  if (Number(generation) !== Math.max(1, Math.floor(expectedGeneration || 1))) return false;
  const expected = challengeSignature(expires, generation, nonce);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
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

export function setOwnerChallengeCookie(response: NextResponse, token: string) {
  response.cookies.set(OWNER_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_SECONDS,
  });
}

export function clearOwnerChallengeCookie(response: NextResponse) {
  response.cookies.set(OWNER_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
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

import { NextRequest, NextResponse } from "next/server";
import {
  configuredOwnerPassword,
  createOwnerSession,
  passwordMatches,
  setOwnerCookie,
} from "@/lib/owner-auth";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function blocked(ip: string) {
  const now = Date.now();
  const existing = attempts.get(ip);
  if (!existing || existing.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_ATTEMPTS;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }
  if (contentLength > 2_000) {
    return NextResponse.json({ message: "Login request is too large." }, { status: 413 });
  }

  const ip = clientIp(request);
  if (blocked(ip)) {
    return NextResponse.json({ message: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const expected = configuredOwnerPassword();
  if (!expected) {
    return NextResponse.json({ message: "Owner access is not configured." }, { status: 503 });
  }

  let password = "";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Login request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ message: "Invalid login request." }, { status: 400 });
  }

  if (password.length > 200 || !passwordMatches(password, expected)) {
    return NextResponse.json({ message: "Incorrect password." }, { status: 401 });
  }

  attempts.delete(ip);
  try {
    await writeAudit({actor:"owner",actorId:"owner",action:"owner-login",targetType:"owner",targetId:"owner",summary:"Owner signed in.",ipHash:requestIpHash(request)});
    const response = NextResponse.json({ message: "Signed in." });
    setOwnerCookie(response, createOwnerSession());
    return response;
  } catch {
    return NextResponse.json({ message: "Owner access is not configured securely." }, { status: 503 });
  }
}

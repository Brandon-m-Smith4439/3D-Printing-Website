import { NextRequest, NextResponse } from "next/server";
import {
  OWNER_CHALLENGE_COOKIE,
  clearOwnerChallengeCookie,
  createOwnerSession,
  setOwnerCookie,
  validOwnerChallenge,
} from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { readOwnerSecurityState, verifyOwnerSecondFactor } from "@/lib/owner-security";
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

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  const ip = clientIp(request);
  if (blocked(ip)) {
    return NextResponse.json({ message: "Too many verification attempts. Start sign-in again later." }, { status: 429 });
  }

  const state = await readOwnerSecurityState();
  const challenge = request.cookies.get(OWNER_CHALLENGE_COOKIE)?.value;
  if (!validOwnerChallenge(challenge, state.sessionGeneration)) {
    return NextResponse.json({ message: "Your sign-in challenge expired. Enter the owner password again." }, { status: 401 });
  }

  let code = "";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Verification request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ message: "Invalid verification request." }, { status: 400 });
  }

  const result = await verifyOwnerSecondFactor(code);
  if (!result.ok) {
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-2fa-failed",
      targetType: "owner",
      targetId: "owner",
      summary: "Owner second-factor verification failed.",
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({ message: "Authenticator or recovery code was not accepted." }, { status: 401 });
  }

  attempts.delete(ip);
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: result.method === "recovery" ? "owner-recovery-code-used" : "owner-2fa-verified",
    targetType: "owner",
    targetId: "owner",
    summary: result.method === "recovery"
      ? "Owner signed in with a one-time recovery code."
      : "Owner signed in with authenticator-app two-factor verification.",
    ipHash: requestIpHash(request),
  });
  const response = NextResponse.json({
    message: "Signed in.",
    method: result.method,
    recoveryCodesRemaining: result.state.recoveryCodeHashes.length,
  });
  setOwnerCookie(response, createOwnerSession(result.state.sessionGeneration));
  clearOwnerChallengeCookie(response);
  return response;
}

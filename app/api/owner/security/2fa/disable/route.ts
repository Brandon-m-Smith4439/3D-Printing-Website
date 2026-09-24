import { NextRequest, NextResponse } from "next/server";
import {
  configuredOwnerPassword,
  createOwnerSession,
  passwordMatches,
  requestIsOwner,
  setOwnerCookie,
} from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { disableOwnerTotp, ownerSecurityStatus, verifyOwnerSecondFactor } from "@/lib/owner-security";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  let password = "";
  let code = "";
  try {
    const raw = await request.text();
    if (raw.length > 4_000) return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { password?: unknown; code?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const expected = configuredOwnerPassword();
  if (!expected || password.length > 200 || !passwordMatches(password, expected)) {
    return NextResponse.json({ message: "Owner password was not accepted." }, { status: 401 });
  }

  const secondFactor = await verifyOwnerSecondFactor(code);
  if (!secondFactor.ok) {
    return NextResponse.json({ message: "Authenticator or recovery code was not accepted." }, { status: 401 });
  }

  const security = await disableOwnerTotp();
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: "owner-2fa-disabled",
    targetType: "owner",
    targetId: "owner",
    summary: `Owner disabled two-factor authentication using ${secondFactor.method === "recovery" ? "a recovery code" : "an authenticator code"}.`,
    ipHash: requestIpHash(request),
  });

  const response = NextResponse.json({
    security: await ownerSecurityStatus(),
    message: "Two-factor authentication disabled. Other owner sessions were signed out.",
  });
  setOwnerCookie(response, createOwnerSession(security.sessionGeneration));
  return response;
}

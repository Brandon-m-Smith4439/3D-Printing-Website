import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { configuredOwnerPassword, passwordMatches, requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { beginOwnerTotpEnrollment, ownerSecurityStatus } from "@/lib/owner-security";
import { totpAuthUri } from "@/lib/owner-totp";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  let password = "";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const expectedPassword = configuredOwnerPassword();
  if (!expectedPassword || password.length > 200 || !passwordMatches(password, expectedPassword)) {
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-2fa-setup-password-failed",
      targetType: "owner",
      targetId: "owner",
      summary: "Owner password re-authentication failed while starting two-factor setup.",
      ipHash: requestIpHash(request),
    }).catch(() => undefined);
    return NextResponse.json({ message: "Owner password was not accepted." }, { status: 401 });
  }

  const status = await ownerSecurityStatus();
  if (status.twoFactorEnabled) {
    return NextResponse.json({ message: "Two-factor authentication is already enabled." }, { status: 409 });
  }

  try {
    const { secret } = await beginOwnerTotpEnrollment();
    const otpauthUri = totpAuthUri(secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-2fa-setup-started",
      targetType: "owner",
      targetId: "owner",
      summary: "Owner started authenticator-app two-factor setup.",
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      manualSecret: secret,
      otpauthUri,
      qrDataUrl,
      expiresInMinutes: 15,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("Owner 2FA setup failed", error);
    return NextResponse.json({ message: "Could not start two-factor setup." }, { status: 500 });
  }
}

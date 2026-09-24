import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requestIsOwner } from "@/lib/owner-auth";
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
    });
  } catch (error) {
    console.error("Owner 2FA setup failed", error);
    return NextResponse.json({ message: "Could not start two-factor setup." }, { status: 500 });
  }
}

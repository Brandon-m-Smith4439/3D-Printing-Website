import { NextRequest, NextResponse } from "next/server";
import { createOwnerSession, requestIsOwner, setOwnerCookie } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { enableOwnerTotp, ownerSecurityStatus } from "@/lib/owner-security";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  let code = "";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await enableOwnerTotp(code);
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-2fa-enabled",
      targetType: "owner",
      targetId: "owner",
      summary: "Authenticator-app two-factor authentication was enabled.",
      ipHash: requestIpHash(request),
    });
    const response = NextResponse.json({
      security: await ownerSecurityStatus(),
      recoveryCodes: result.recoveryCodes,
      message: "Two-factor authentication enabled. Save the recovery codes now.",
    }, { headers: { "Cache-Control": "no-store, private" } });
    setOwnerCookie(response, createOwnerSession(result.state.sessionGeneration));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not enable two-factor authentication.";
    const status = /code|expired|setup/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}

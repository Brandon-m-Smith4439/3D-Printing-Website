import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { ownerSecurityStatus, regenerateOwnerRecoveryCodes } from "@/lib/owner-security";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
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
    const result = await regenerateOwnerRecoveryCodes(code);
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-recovery-codes-regenerated",
      targetType: "owner",
      targetId: "owner",
      summary: "Owner generated a new set of recovery codes; all previous recovery codes were invalidated.",
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      security: await ownerSecurityStatus(),
      recoveryCodes: result.recoveryCodes,
      message: "New recovery codes generated. Save them now; the old codes no longer work.",
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not regenerate recovery codes." }, { status: 400 });
  }
}

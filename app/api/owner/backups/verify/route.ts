import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { verifyBackup } from "@/lib/backups";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  let name = "";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as { name?: unknown };
    name = typeof body.name === "string" ? body.name : "";
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  try {
    const verification = await verifyBackup(name);
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: verification.healthy ? "backup-verified" : "backup-verification-failed",
      targetType: "backup",
      targetId: verification.name,
      summary: verification.healthy
        ? `Backup verified healthy: ${verification.name}.`
        : `Backup integrity check needs attention: ${verification.name}.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      verification,
      message: verification.healthy ? "Backup verification passed." : "Backup verification found an integrity issue.",
    }, { status: verification.healthy ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify backup.";
    const status = /invalid|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { createBackup, ensureDailyBackup, listBackups } from "@/lib/backups";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  try {
    await ensureDailyBackup();
    const backups = await listBackups();
    return NextResponse.json({ backups }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load backups", error);
    return NextResponse.json({ message: "Could not load backup status." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  try {
    const backup = await createBackup("manual");
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "backup-created",
      targetType: "backup",
      targetId: backup.name,
      summary: `Secure backup snapshot created: ${backup.name}.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({ backup, message: "Secure backup snapshot created." }, { status: 201 });
  } catch (error) {
    console.error("Could not create backup", error);
    return NextResponse.json({ message: "Could not create backup snapshot." }, { status: 500 });
  }
}

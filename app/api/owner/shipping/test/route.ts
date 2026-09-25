import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { testEasyPostConnection } from "@/lib/easypost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const diagnostic = await testEasyPostConnection();
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: diagnostic.connected ? "easypost-connection-test-passed" : "easypost-connection-test-failed",
    targetType: "integration",
    targetId: "easypost",
    summary: diagnostic.message,
    ipHash: requestIpHash(request),
  });

  return NextResponse.json(
    { diagnostic },
    { status: diagnostic.connected ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

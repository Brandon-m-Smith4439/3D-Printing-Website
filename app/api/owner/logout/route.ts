import { NextRequest, NextResponse } from "next/server";
import { clearOwnerChallengeCookie, clearOwnerCookie, requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const wasOwner = await requestIsOwner(request).catch(() => false);
  if (wasOwner) {
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "owner-logout",
      targetType: "owner",
      targetId: "owner",
      summary: "Owner signed out.",
      ipHash: requestIpHash(request),
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ message: "Signed out." });
  clearOwnerCookie(response);
  clearOwnerChallengeCookie(response);
  return response;
}

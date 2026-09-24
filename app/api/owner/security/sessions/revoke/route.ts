import { NextRequest, NextResponse } from "next/server";
import { createOwnerSession, requestIsOwner, setOwnerCookie } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { advanceOwnerSessionGeneration, ownerSecurityStatus } from "@/lib/owner-security";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  const security = await advanceOwnerSessionGeneration();
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: "owner-sessions-revoked",
    targetType: "owner",
    targetId: "owner",
    summary: "Owner signed out all other owner sessions.",
    ipHash: requestIpHash(request),
  });
  const response = NextResponse.json({
    security: await ownerSecurityStatus(),
    message: "Other owner sessions were signed out.",
  });
  setOwnerCookie(response, createOwnerSession(security.sessionGeneration));
  return response;
}

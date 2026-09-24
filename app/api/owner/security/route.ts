import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { ownerSecurityStatus } from "@/lib/owner-security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json(
    { security: await ownerSecurityStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

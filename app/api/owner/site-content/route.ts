import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getSiteContent, siteContentSchema, writeSiteContent } from "@/lib/site-content-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const content = await getSiteContent();
  return NextResponse.json({ content }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  if (!(await requestIsOwner(request))) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request body." }, { status: 400 }); }
  const parsed = siteContentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Please check the site content fields." }, { status: 400 });
  const content = await writeSiteContent(parsed.data);
  return NextResponse.json({ content });
}

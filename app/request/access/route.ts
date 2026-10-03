import { NextRequest, NextResponse } from "next/server";
import { requestFromGuestAccessToken, setGuestRequestCookie } from "@/lib/guest-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://meshharbor3d.com" : request.url);
  const token = request.nextUrl.searchParams.get("token") || "";
  const stored = await requestFromGuestAccessToken(token);
  if (!stored) {
    const url = new URL("/login?guest=expired", publicOrigin);
    return NextResponse.redirect(url);
  }
  const destination = new URL(`/request/${encodeURIComponent(stored.requestCode)}`, publicOrigin);
  const response = NextResponse.redirect(destination);
  setGuestRequestCookie(response, stored);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

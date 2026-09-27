import { NextRequest, NextResponse } from "next/server";
import { requestFromGuestAccessToken, setGuestRequestCookie } from "@/lib/guest-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const stored = await requestFromGuestAccessToken(token);
  if (!stored) {
    const url = new URL("/login?guest=expired", request.url);
    return NextResponse.redirect(url);
  }
  const destination = new URL(`/request/${encodeURIComponent(stored.requestCode)}`, request.url);
  const response = NextResponse.redirect(destination);
  setGuestRequestCookie(response, stored);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

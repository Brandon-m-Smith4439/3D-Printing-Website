import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/favicon.png";
  target.search = "";
  return NextResponse.redirect(target, 308);
}

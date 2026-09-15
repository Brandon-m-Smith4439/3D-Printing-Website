import { NextResponse } from "next/server";
import { clearOwnerCookie } from "@/lib/owner-auth";

export async function POST() {
  const response = NextResponse.json({ message: "Signed out." });
  clearOwnerCookie(response);
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerSession, setCustomerCookie } from "@/lib/customer-auth";
import { findCustomerByEmail, verifyCustomerPassword } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { claimGuestRequestsByEmail } from "@/lib/request-store";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(128) });
const attempts = new Map<string, { count: number; resetAt: number }>();
function ipOf(request: NextRequest) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"; }
function blocked(ip: string) { const now = Date.now(); const current = attempts.get(ip); if (!current || current.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 }); return false; } current.count += 1; return current.count > 8; }

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.includes("application/json")) return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  if (contentLength > 4_000) return NextResponse.json({ message: "Account request is too large." }, { status: 413 });
  const ip = ipOf(request); if (blocked(ip)) return NextResponse.json({ message: "Too many login attempts. Try again later." }, { status: 429 });
  let body: unknown; try { const raw = await request.text(); if (raw.length > 4_000) return NextResponse.json({ message: "Account request is too large." }, { status: 413 }); body = JSON.parse(raw); } catch { return NextResponse.json({ message: "Invalid login request." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: "Enter a valid email and password." }, { status: 400 });
  const account = await findCustomerByEmail(parsed.data.email);
  if (!account || !(await verifyCustomerPassword(account, parsed.data.password))) return NextResponse.json({ message: "Incorrect email or password." }, { status: 401 });
  attempts.delete(ip);
  const claimed = account.emailVerifiedAt ? await claimGuestRequestsByEmail(account.id, account.email) : 0;
  await writeAudit({actor:"customer",actorId:account.id,action:"login",targetType:"customer",targetId:account.id,summary:`Customer signed in${claimed ? `; ${claimed} matching guest request(s) linked to verified account` : ""}.`,ipHash:requestIpHash(request)});
  const response = NextResponse.json({ customer: { id: account.id, email: account.email, displayName: account.displayName } });
  setCustomerCookie(response, createCustomerSession(account.id, account.sessionVersion));
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { notificationsForCustomer } from "@/lib/customer-notifications";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const notifications = await notificationsForCustomer(customer.id);
  return NextResponse.json({ customer, unreadNotifications: notifications.filter((item) => !item.readAt).length }, { headers: { "Cache-Control": "no-store" } });
}

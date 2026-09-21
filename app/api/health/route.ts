import { NextResponse } from "next/server";
import { initializeDatabase } from "@/lib/database";
import { getSiteContent } from "@/lib/site-content-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initializeDatabase();
    const site = await getSiteContent();
    return NextResponse.json(
      { ok: true, service: "Mesh Harbor 3D", site: site.name, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed", error);
    return NextResponse.json({ ok: false, service: "Mesh Harbor 3D" }, { status: 503 });
  }
}

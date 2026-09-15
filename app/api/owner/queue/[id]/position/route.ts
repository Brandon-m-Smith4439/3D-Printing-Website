import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { moveQueueJobToPosition } from "@/lib/queue-store";

const schema = z.object({ position: z.coerce.number().int().min(1).max(9999) });
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: "Enter a valid queue position." }, { status: 400 });
  const { id } = await context.params;
  const job = await moveQueueJobToPosition(id, parsed.data.position);
  return job ? NextResponse.json({ job }) : NextResponse.json({ message: "Queue job not found." }, { status: 404 });
}

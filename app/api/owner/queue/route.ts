import { NextRequest, NextResponse } from "next/server";
import { createQueueJobSchema } from "@/lib/queue-types";
import { createQueueJob, readQueue } from "@/lib/queue-store";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  const jobs = await readQueue();
  jobs.sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    if (a.status !== "completed" && b.status !== "completed") return a.sortOrder - b.sortOrder;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }
  if (contentLength > 12_000) {
    return NextResponse.json({ message: "Queue request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return NextResponse.json({ message: "Queue request is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = createQueueJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Please check the queue job fields." }, { status: 400 });
  }

  const job = await createQueueJob(parsed.data);
  return NextResponse.json({ job }, { status: 201 });
}

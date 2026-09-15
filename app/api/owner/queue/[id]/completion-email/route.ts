import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sendCompletionEmail } from "@/lib/completion-email";
import { readQueue, updateQueueJob } from "@/lib/queue-store";

export const runtime = "nodejs";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const { id } = await context.params;
  const jobs = await readQueue();
  const job = jobs.find((item) => item.id === id);
  if (!job) return NextResponse.json({ message: "Queue job not found." }, { status: 404 });
  if (job.status !== "completed") {
    return NextResponse.json({ message: "Only completed jobs can send the completion email." }, { status: 400 });
  }

  try {
    const result = await sendCompletionEmail(job);
    if (!result.sent) {
      return NextResponse.json({ message: "Development mode: email logged but not sent because Resend is not configured." });
    }
    const sentAt = new Date().toISOString();
    await updateQueueJob(id, {}, sentAt);
    return NextResponse.json({ message: "Completion email sent.", sentAt });
  } catch (error) {
    console.error("Completion email resend failed", error);
    return NextResponse.json({ message: "The completion email could not be sent." }, { status: 502 });
  }
}

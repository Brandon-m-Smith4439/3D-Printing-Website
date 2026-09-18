import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { notificationsForCustomer } from "@/lib/customer-notifications";
import { readQueue } from "@/lib/queue-store";
import { readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const [requests, queue, notifications, quotes] = await Promise.all([readRequests(), readQueue(), notificationsForCustomer(customer.id), readQuotes()]);
  const active = queue.filter((job) => job.status !== "completed").sort((a, b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const activeIndex = new Map(active.map((job, index) => [job.id, index + 1]));
  const own = requests
    .filter((item) => item.customerAccountId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const job = item.queueJobId ? queue.find((candidate) => candidate.id === item.queueJobId) : null;
      const quote = quotes.find((candidate) => candidate.requestId === item.id && !["void", "draft"].includes(candidate.status)) || null;
      return {
        id: item.id, requestCode: item.requestCode, status: item.status, projectType: item.projectType,
        quantity: item.quantity, neededBy: item.neededBySubmitted || item.neededBy, description: item.description,
        createdAt: item.createdAt,
        quote: quote ? {
          id: quote.id, revision: quote.revision, status: quote.status, totalCents: quote.totalCents, depositCents: quote.depositCents,
          balanceCents: quote.balanceCents, currency: quote.currency, material: quote.material, dimensions: quote.dimensions,
          estimatedReadyDate: quote.estimatedReadyDate, notes: quote.notes, terms: quote.terms, sentAt: quote.sentAt,
          approvedAt: quote.approvedAt, depositPaidAt: quote.depositPaidAt, history: quote.history,
        } : null,
        queue: job ? {
          publicCode: job.publicCode, publicTitle: job.publicTitle, status: job.status,
          position: activeIndex.get(job.id) || null, estimatedReadyDate: job.estimatedReadyDate,
          publicNote: job.publicNote, imageUrl: job.imageUrl,
        } : null,
      };
    });
  return NextResponse.json({ requests: own, notifications }, { headers: { "Cache-Control": "no-store" } });
}

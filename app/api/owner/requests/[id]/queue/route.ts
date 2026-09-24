import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { readRequests, updateStoredRequest } from "@/lib/request-store";
import { queueFromRequestSchema } from "@/lib/request-types";
import { createQueueJob } from "@/lib/queue-store";
import { quoteForRequest } from "@/lib/quote-store";
import { quoteDepositSatisfied } from "@/lib/quote-types";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
function defaultQueueTitle(projectType: string) { return ({ display:"Display / collectible print", functional:"Functional print", replacement:"Replacement part", prototype:"Prototype print", other:"Custom 3D print" } as Record<string,string>)[projectType] || "Custom 3D print"; }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const { id } = await context.params;
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request body." }, { status: 400 }); }
  if (!queueFromRequestSchema.safeParse(body).success) return NextResponse.json({ message: "Invalid queue action." }, { status: 400 });
  const requests = await readRequests(); const source = requests.find((item) => item.id === id);
  if (!source) return NextResponse.json({ message: "Request not found." }, { status: 404 });
  if (source.queueJobId) return NextResponse.json({ message: "This request is already linked to a queue job." }, { status: 409 });
  const quote = await quoteForRequest(source.id);
  if (source.status !== "deposit-paid" || !quote || quote.status !== "deposit-paid" || !quoteDepositSatisfied(quote)) return NextResponse.json({ message: "The current quote's confirmed 50% deposit requirement must be satisfied before adding this custom request to production." }, { status: 409 });
  const job = await createQueueJob({ sourceRequestId:source.id, publicTitle:defaultQueueTitle(source.projectType), customerName:source.name, customerEmail:source.email, fulfillmentMethod:quote.fulfillmentMode, quantity:source.quantity, estimatedReadyDate:quote.estimatedReadyDate || source.neededBy, imageUrl:"", publicNote:"", privateNote:"" });
  const updated = await updateStoredRequest(source.id,{status:"queued",queuedAt:new Date().toISOString(),queueJobId:job.id});
  if(updated)await notifyCustomer(updated,"Your deposit is confirmed and your print has been added to the production queue.");
  await writeAudit({actor:"owner",actorId:"owner",action:"request-queued",targetType:"request",targetId:source.id,summary:`${source.requestCode} added to production after deposit confirmation.`,ipHash:requestIpHash(request)});
  return NextResponse.json({job,request:updated},{status:201});
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { deleteQueueJob } from "@/lib/queue-store";
import { deleteStoredRequest, getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer, deleteNotificationsForRequest } from "@/lib/customer-notifications";
import { deleteCustomerUploadsForRequest } from "@/lib/customer-upload-store";
import { quoteForRequest, voidQuoteForRequest } from "@/lib/quote-store";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
const schema = z.object({ status: z.enum(["new", "reviewing", "declined"]) });
const requestMessages: Record<string,string> = { new:"Your request is marked as new and is waiting for review.", reviewing:"Your custom print request is being reviewed.", declined:"Your request was declined/closed. Please contact us if you have questions or want to revise the project." };

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;let body:unknown;try{body=await request.json();}catch{return NextResponse.json({message:"Invalid request body."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Choose a valid owner-managed request status."},{status:400});
  const source=await getStoredRequest(id);if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  if(source.queueJobId)return NextResponse.json({message:"Remove this request from the production queue before changing it to a request-only status."},{status:409});
  const quote=await quoteForRequest(source.id);
  if(parsed.data.status==="declined"&&quote?.depositPaidAt)return NextResponse.json({message:"A deposit is already recorded. Resolve/refund the payment before declining this request."},{status:409});
  if(parsed.data.status==="declined")await voidQuoteForRequest(source.id);
  const updated=await updateStoredRequest(id,{status:parsed.data.status});
  if(updated&&source.status!==parsed.data.status)await notifyCustomer(updated,requestMessages[parsed.data.status]||`Your request status is now ${parsed.data.status}.`);
  await writeAudit({actor:"owner",actorId:"owner",action:`request-${parsed.data.status}`,targetType:"request",targetId:source.id,summary:`${source.requestCode} changed to ${parsed.data.status}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({request:updated});
}

export async function DELETE(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const source=await getStoredRequest(id);if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  const quote=await quoteForRequest(source.id);
  if(quote?.depositPaidAt||source.status==="completed")return NextResponse.json({message:"Paid or completed records are retained for accounting and audit history. Resolve/refund the order instead of permanently deleting it."},{status:409});
  if(source.queueJobId)await deleteQueueJob(source.queueJobId);
  await voidQuoteForRequest(source.id);
  await deleteNotificationsForRequest(source.id);
  await deleteCustomerUploadsForRequest(source.id);
  await deleteStoredRequest(source.id);
  await writeAudit({actor:"owner",actorId:"owner",action:"request-deleted",targetType:"request",targetId:source.id,summary:`${source.requestCode} permanently deleted.`,ipHash:requestIpHash(request)});
  return NextResponse.json({message:"Request and its linked queue job were permanently deleted."});
}

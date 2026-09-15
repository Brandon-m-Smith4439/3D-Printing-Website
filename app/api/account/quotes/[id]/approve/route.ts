import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { approveQuote, quoteById } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const customer=await customerFromRequest(request);if(!customer)return NextResponse.json({message:"Sign in required."},{status:401});
  if(!customer.emailVerified)return NextResponse.json({message:"Verify your email before accepting a quote."},{status:403});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.customerAccountId!==customer.id)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent")return NextResponse.json({message:"This quote is not currently awaiting approval."},{status:409});
  const source=await getStoredRequest(quote.requestId);if(!source||source.customerAccountId!==customer.id)return NextResponse.json({message:"Request not found."},{status:404});
  const approved=await approveQuote(id,customer.id);if(!approved)return NextResponse.json({message:"Could not approve quote."},{status:409});
  const updated=await updateStoredRequest(source.id,{status:"accepted"});
  if(updated)await notifyCustomer(updated,"You approved the quote and terms. The 50% deposit is now required before production can begin.",{email:false});
  await writeAudit({actor:"customer",actorId:customer.id,action:"quote-approved",targetType:"quote",targetId:id,summary:`Customer approved quote revision ${approved.revision} for ${source.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({quote:approved,message:"Quote approved. You can now pay the deposit."});
}

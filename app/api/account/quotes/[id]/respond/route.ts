import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { customerQuoteResponseSchema } from "@/lib/quote-types";
import { quoteById, respondToQuote } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const customer=await customerFromRequest(request);if(!customer)return NextResponse.json({message:"Sign in required."},{status:401});
  if(!customer.emailVerified)return NextResponse.json({message:"Verify your email before responding to a quote."},{status:403});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{const raw=await request.text();if(raw.length>5000)return NextResponse.json({message:"Response is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Invalid quote response."},{status:400});}
  const parsed=customerQuoteResponseSchema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Please check your quote response."},{status:400});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.customerAccountId!==customer.id)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent")return NextResponse.json({message:"This quote is no longer awaiting a response."},{status:409});
  const source=await getStoredRequest(quote.requestId);if(!source||source.customerAccountId!==customer.id)return NextResponse.json({message:"Request not found."},{status:404});
  const updatedQuote=await respondToQuote(id,customer.id,parsed.data);if(!updatedQuote)return NextResponse.json({message:"Could not record your response."},{status:409});
  await updateStoredRequest(source.id,{status:"reviewing"});
  if(parsed.data.action==="counter"){
    await notifyCustomer(source,`Your counter offer of $${(parsed.data.counterTotalCents/100).toFixed(2)} was sent to the owner.`,{email:false});
    await writeAudit({actor:"customer",actorId:customer.id,action:"quote-countered",targetType:"quote",targetId:id,summary:`Customer countered quote revision ${quote.revision} for ${source.requestCode}.`,ipHash:requestIpHash(request)});
    return NextResponse.json({quote:updatedQuote,message:"Counter offer sent. The owner can review it and send a revised quote."});
  }
  await notifyCustomer(source,"You declined the current quote. The owner can review your request and send a revised quote if appropriate.",{email:false});
  await writeAudit({actor:"customer",actorId:customer.id,action:"quote-declined",targetType:"quote",targetId:id,summary:`Customer declined quote revision ${quote.revision} for ${source.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({quote:updatedQuote,message:"Quote declined. Your request remains available for owner review."});
}

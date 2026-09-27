import { NextRequest, NextResponse } from "next/server";
import { guestRequestFromRequest } from "@/lib/guest-access";
import { sameOrigin } from "@/lib/owner-api";
import { customerQuoteResponseSchema } from "@/lib/quote-types";
import { quoteById, respondToGuestQuote } from "@/lib/quote-store";
import { updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const guest=await guestRequestFromRequest(request);if(!guest)return NextResponse.json({message:"Open the secure request link from your email again."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{const raw=await request.text();if(raw.length>5000)return NextResponse.json({message:"Response is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Invalid quote response."},{status:400});}
  const parsed=customerQuoteResponseSchema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Please check your quote response."},{status:400});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.requestId!==guest.id )return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent")return NextResponse.json({message:"This quote is no longer awaiting a response."},{status:409});
  const updatedQuote=await respondToGuestQuote(id,guest.id,parsed.data);if(!updatedQuote)return NextResponse.json({message:"Could not record your response."},{status:409});
  await updateStoredRequest(guest.id,{status:"reviewing"});
  if(parsed.data.action==="counter"){await notifyCustomer(guest,`Your counter offer of $${(parsed.data.counterTotalCents/100).toFixed(2)} was sent to Mesh Harbor 3D.`,{email:false});await writeAudit({actor:"customer",actorId:"guest-email",action:"quote-countered",targetType:"quote",targetId:id,summary:`Guest customer countered quote revision ${quote.revision} for ${guest.requestCode}.`,ipHash:requestIpHash(request)});return NextResponse.json({quote:updatedQuote,message:"Counter offer sent. Mesh Harbor 3D can review it and send a revised quote."});}
  await notifyCustomer(guest,"You declined the current quote. Mesh Harbor 3D can review your request and send a revised quote if appropriate.",{email:false});
  await writeAudit({actor:"customer",actorId:"guest-email",action:"quote-declined",targetType:"quote",targetId:id,summary:`Guest customer declined quote revision ${quote.revision} for ${guest.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({quote:updatedQuote,message:"Quote declined. Your request remains available for review."});
}

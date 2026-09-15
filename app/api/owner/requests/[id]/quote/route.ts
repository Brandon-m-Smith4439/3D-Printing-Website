import { NextRequest, NextResponse } from "next/server";
import { ownerQuoteSchema } from "@/lib/quote-types";
import { upsertQuote } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params; const source=await getStoredRequest(id); if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  let body:unknown;try{const raw=await request.text();if(raw.length>20_000)return NextResponse.json({message:"Quote request is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Invalid quote request."},{status:400});}
  const parsed=ownerQuoteSchema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Please check the quote fields.",fieldErrors:parsed.error.flatten().fieldErrors},{status:400});
  if(source.queueJobId||source.status==="completed")return NextResponse.json({message:"This request is already in production or completed. Remove it from production before revising its quote."},{status:409});
  if(parsed.data.action==="send"&&!source.customerAccountId)return NextResponse.json({message:"This request was submitted without a signed-in customer profile. You can save a draft, but profile approval requires a linked customer account."},{status:409});
  const quote=await upsertQuote({requestId:source.id,requestCode:source.requestCode,customerAccountId:source.customerAccountId||"",totalCents:parsed.data.totalCents,depositCents:parsed.data.depositCents,material:parsed.data.material,dimensions:parsed.data.dimensions,estimatedReadyDate:parsed.data.estimatedReadyDate,notes:parsed.data.notes,terms:parsed.data.terms,send:parsed.data.action==="send"});
  if(parsed.data.action==="send"){
    const updated=await updateStoredRequest(source.id,{status:"quoted"});
    if(updated)await notifyCustomer(updated,`A quote is ready for review. Total: $${(quote.totalCents/100).toFixed(2)}. Deposit due after approval: $${(quote.depositCents/100).toFixed(2)}.`);
  }else if(quote.status==="draft"&&["quoted","accepted"].includes(source.status)){
    await updateStoredRequest(source.id,{status:"reviewing"});
  }
  await writeAudit({actor:"owner",actorId:"owner",action:parsed.data.action==="send"?"quote-sent":"quote-saved",targetType:"request",targetId:source.id,summary:`Quote revision ${quote.revision} ${parsed.data.action==="send"?"sent":"saved"} for ${source.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({quote,message:parsed.data.action==="send"?"Quote sent to the customer profile.":"Quote draft saved."});
}

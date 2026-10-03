import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema=z.object({fulfillmentMethod:z.enum(["pickup","shipping","local-delivery"]),assemblyPreference:z.enum(["assembled","disassembled"]),customerConfirmed:z.literal(true)}).strict();
// This records a customer's missing choices, never changes a submitted choice.
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({message:"Invalid request body."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Record the choices confirmed by the customer."},{status:400});
  const {id}=await context.params;const source=await getStoredRequest(id);if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  const quote=await quoteForRequest(id);
  if(source.queueJobId||source.status==="completed"||(quote&&quote.status!=="draft"))return NextResponse.json({message:"Resolve customer choices before sending a quote or entering production."},{status:409});
  if(source.fulfillmentMethod!=="unsure"&&source.fulfillmentMethod!==parsed.data.fulfillmentMethod)return NextResponse.json({message:"The customer's submitted fulfillment choice is preserved."},{status:409});
  if(source.assemblyPreference&&source.assemblyPreference!=="unsure"&&source.assemblyPreference!==parsed.data.assemblyPreference)return NextResponse.json({message:"The customer's submitted assembly choice is preserved."},{status:409});
  if(source.paymentPreference&&source.paymentPreference!=="stripe"&&parsed.data.fulfillmentMethod!=="pickup")return NextResponse.json({message:"Local / manual payment is pickup-only."},{status:409});
  const updated=await updateStoredRequest(id,{fulfillmentMethod:parsed.data.fulfillmentMethod,assemblyPreference:parsed.data.assemblyPreference});
  await writeAudit({actor:"owner",actorId:"owner",action:"customer-choices-confirmed",targetType:"request",targetId:id,summary:`Customer confirmed ${parsed.data.fulfillmentMethod} and ${parsed.data.assemblyPreference} for ${source.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({request:updated,message:"Customer-confirmed choices saved on the request."});
}

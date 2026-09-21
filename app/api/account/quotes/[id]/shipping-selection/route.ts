import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { quoteById, selectQuoteShipping } from "@/lib/quote-store";
import { shippingAddressSchema, shippingSelectionSchema } from "@/lib/quote-types";
import { verifySelectedEasyPostRate } from "@/lib/easypost";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const customer=await customerFromRequest(request);if(!customer)return NextResponse.json({message:"Sign in required."},{status:401});
  if(!customer.emailVerified)return NextResponse.json({message:"Verify your email before selecting shipping."},{status:403});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.customerAccountId!==customer.id)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent"||quote.fulfillmentMode!=="shipping")return NextResponse.json({message:"Shipping cannot be changed for this quote right now."},{status:409});
  let body:unknown;try{const raw=await request.text();if(raw.length>10_000)return NextResponse.json({message:"Shipping selection is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Invalid shipping selection."},{status:400});}
  const root=body&&typeof body==="object"?body as Record<string,unknown>:{};
  const selection=shippingSelectionSchema.safeParse(root.selection);const address=shippingAddressSchema.safeParse(root.address);
  if(!selection.success||!address.success)return NextResponse.json({message:"Please refresh rates and choose a valid shipping option."},{status:400});
  try{
    const rate=await verifySelectedEasyPostRate(selection.data.shipmentId,selection.data.rateId);
    const updated=await selectQuoteShipping(id,customer.id,rate,selection.data.shipmentId,address.data);if(!updated)return NextResponse.json({message:"Shipping could not be saved. Refresh the quote and try again."},{status:409});
    await writeAudit({actor:"customer",actorId:customer.id,action:"shipping-selected",targetType:"quote",targetId:id,summary:`Customer selected ${rate.carrier} ${rate.service} for ${updated.requestCode}.`,ipHash:requestIpHash(request)});
    return NextResponse.json({quote:updated,message:`${rate.carrier} ${rate.service} selected for ${(rate.rateCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}.`});
  }catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Could not save shipping selection."},{status:502});}
}

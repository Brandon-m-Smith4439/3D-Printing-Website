import { NextRequest, NextResponse } from "next/server";
import { ownerQuoteSchema, quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { quoteForRequest, upsertQuote } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { expireStripeCheckoutSession } from "@/lib/stripe-checkout";
import { readQueue } from "@/lib/queue-store";
import { queueScheduleBoundary, quoteWouldSkipQueue } from "@/lib/queue-schedule";
import { validateQuoteCostInput } from "@/lib/quote-cost-input";
import { ensureBambuCatalogSeeded, readBambuCatalog, readPricingSettings } from "@/lib/pricing-store";
import { readFilamentPurchaseLots } from "@/lib/bambu-purchase-store";
import { readShipments } from "@/lib/shipment-store";
import { resolveQuoteCostSnapshot } from "@/lib/quote-cost-engine";
import { saveCostSnapshot } from "@/lib/quote-cost-store";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});

  const {id}=await context.params;
  const source=await getStoredRequest(id);
  if(!source)return NextResponse.json({message:"Request not found."},{status:404});

  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>20_000)return NextResponse.json({message:"Quote request is too large."},{status:413});
    body=JSON.parse(raw);
  }catch{
    return NextResponse.json({message:"Invalid quote request."},{status:400});
  }

  const parsed=ownerQuoteSchema.safeParse(body);
  if(!parsed.success)return NextResponse.json({message:"Please check the quote fields.",fieldErrors:parsed.error.flatten().fieldErrors},{status:400});
  const root=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:{};
  let costing=null;
  if(Object.prototype.hasOwnProperty.call(root,"costing")){
    try{costing=validateQuoteCostInput(root.costing);}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Check the internal costing fields."},{status:400});}
  }
  if(source.queueJobId||source.status==="completed")return NextResponse.json({message:"This request is already in production or completed. Remove it from production before revising its quote."},{status:409});
  if(parsed.data.action==="send"&&!source.customerAccountId)return NextResponse.json({message:"This request is not linked to a verified customer profile yet. You can save a draft, but profile approval requires a linked customer account."},{status:409});

  const jobs=await readQueue();
  const scheduleBoundary=queueScheduleBoundary(jobs,source.id);
  const skipsQueue=quoteWouldSkipQueue(jobs,parsed.data.estimatedReadyDate,source.id);
  if(skipsQueue&&parsed.data.rushFeeCents<50){
    return NextResponse.json({
      message:`The requested ready date would skip active queue work. The current queue extends through ${scheduleBoundary.latestDate}. Add a rush fee or choose ${scheduleBoundary.latestDate} or later.`,
      rushRequired:true,
      queueDateFloor:scheduleBoundary.latestDate,
      queueReferenceCode:scheduleBoundary.latestCode,
    },{status:409});
  }

  const currentQuote=await quoteForRequest(source.id);
  if(currentQuote?.status==="approved"&&currentQuote.stripeCheckoutSessionId){
    try{
      await expireStripeCheckoutSession(currentQuote.stripeCheckoutSessionId);
    }catch(error){
      return NextResponse.json({message:error instanceof Error?error.message:"Could not safely close the previous Stripe checkout before revising this quote."},{status:409});
    }
  }

  const quote=await upsertQuote({
    requestId:source.id,
    requestCode:source.requestCode,
    customerAccountId:source.customerAccountId||"",
    basePriceCents:parsed.data.basePriceCents,
    assemblyMode:parsed.data.assemblyMode,
    assemblyFeeCents:parsed.data.assemblyFeeCents,
    rushFeeCents:parsed.data.rushFeeCents,
    fulfillmentMode:parsed.data.fulfillmentMode,
    localDeliveryFeeCents:parsed.data.localDeliveryFeeCents,
    packageWeightOz:parsed.data.packageWeightOz,
    packageLengthIn:parsed.data.packageLengthIn,
    packageWidthIn:parsed.data.packageWidthIn,
    packageHeightIn:parsed.data.packageHeightIn,
    totalCents:parsed.data.totalCents,
    depositCents:parsed.data.depositCents,
    material:parsed.data.material,
    dimensions:parsed.data.dimensions,
    estimatedReadyDate:parsed.data.estimatedReadyDate,
    notes:parsed.data.notes,
    terms:parsed.data.terms,
    send:parsed.data.action==="send",
  });

  let costSnapshot=null;
  if(costing){
    await ensureBambuCatalogSeeded();
    const [settings,catalog,lots,shipments]=await Promise.all([readPricingSettings(),readBambuCatalog(),readFilamentPurchaseLots(),readShipments()]);
    const shipment=shipments.find(item=>item.requestId===source.id&&item.quoteId===quote.id)||null;
    costSnapshot=await saveCostSnapshot(resolveQuoteCostSnapshot({quote,costing,settings,catalog,lots,shipment,now:new Date().toISOString(),status:"estimate"}));
  }

  if(parsed.data.action==="send"){
    const updated=await updateStoredRequest(source.id,{status:"quoted"});
    if(updated){
      const paidCents=quoteNetDepositPaidCents(quote);
      const outstandingCents=quoteDepositOutstandingCents(quote);
      const refundDueCents=quoteDepositRefundDueCents(quote);
      let message:string;
      if(quote.fulfillmentMode==="shipping"&&!quote.shippingSelection){
        message=paidCents>0
          ? `Revised quote revision ${quote.revision} is ready for review. Your existing ${(paidCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} deposit credit carries forward. Choose a live USPS, UPS, or FedEx rate before approving the final total.`
          : `A quote is ready for review. Production subtotal: $${(quote.totalCents/100).toFixed(2)}. Choose a live USPS, UPS, or FedEx rate in your profile before approving the final total.`;
      }else if(refundDueCents>0){
        message=`Revised quote revision ${quote.revision} is ready for approval. You have ${(paidCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} in deposit credit; approving this revision will refund ${(refundDueCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} to the original payment method.`;
      }else if(paidCents>0&&outstandingCents>0){
        message=`Revised quote revision ${quote.revision} is ready for approval. Your existing deposit credit is ${(paidCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}; after approval, an additional ${(outstandingCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} deposit will be due.`;
      }else if(paidCents>0){
        message=`Revised quote revision ${quote.revision} is ready for approval. Your existing deposit credit already matches the revised 50% deposit requirement.`;
      }else{
        message=`A quote is ready for review. Total: $${(quote.totalCents/100).toFixed(2)}. Deposit due after approval: $${(quote.depositCents/100).toFixed(2)}.`;
      }
      await notifyCustomer(updated,message);
    }
  }else if(quote.status==="draft"&&["quoted","accepted","deposit-paid"].includes(source.status)){
    await updateStoredRequest(source.id,{status:"reviewing"});
  }

  await writeAudit({
    actor:"owner",
    actorId:"owner",
    action:parsed.data.action==="send"?"quote-sent":"quote-saved",
    targetType:"request",
    targetId:source.id,
    summary:`Quote revision ${quote.revision} ${parsed.data.action==="send"?"sent":"saved"} for ${source.requestCode}${skipsQueue?" with a rush fee because its ready date skips active queue work":""}.`,
    ipHash:requestIpHash(request),
  });

  return NextResponse.json({
    quote,
    costing:costSnapshot,
    queueDateFloor:scheduleBoundary.latestDate,
    message:parsed.data.action==="send"
      ? quote.revision>1?"Revised quote sent to the customer for fresh approval.":"Quote sent to the customer profile."
      : "Quote draft saved.",
  });
}

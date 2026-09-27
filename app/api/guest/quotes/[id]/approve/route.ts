import { NextRequest, NextResponse } from "next/server";
import { guestRequestFromRequest } from "@/lib/guest-access";
import { sameOrigin } from "@/lib/owner-api";
import { approveGuestQuote, markQuoteDepositSatisfied, quoteById } from "@/lib/quote-store";
import { updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { reconcileQuoteDepositRefund } from "@/lib/quote-payment-adjustments";
import { customerPolicyAcceptanceSchema } from "@/lib/customer-policies";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const guest=await guestRequestFromRequest(request);if(!guest)return NextResponse.json({message:"Open the secure request link from your email again."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  let body:unknown;try{const raw=await request.text();if(raw.length>2_000)return NextResponse.json({message:"Policy acknowledgment is too large."},{status:413});body=JSON.parse(raw);}catch{return NextResponse.json({message:"Review and accept the current customer policies before approving this quote."},{status:400});}
  const policy=customerPolicyAcceptanceSchema.safeParse(body);if(!policy.success)return NextResponse.json({message:"Review and accept the current Custom Order Terms and Fulfillment Policy before approving this quote."},{status:400});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.requestId!==guest.id )return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="sent")return NextResponse.json({message:"This quote is not currently awaiting approval."},{status:409});
  if(quote.fulfillmentMode==="shipping"&&!quote.shippingSelection)return NextResponse.json({message:"Choose a USPS, UPS, or FedEx shipping option before approving this quote."},{status:409});

  let approved=await approveGuestQuote(id,guest.id,policy.data.policyVersion);if(!approved)return NextResponse.json({message:"Could not approve quote."},{status:409});
  const paidBefore=quoteNetDepositPaidCents(approved);const refundDue=quoteDepositRefundDueCents(approved);
  let refundMessage="";let refundWarning="";let refundPending=false;
  if(refundDue>0){
    try{const result=await reconcileQuoteDepositRefund(approved.id);approved=result.quote;refundPending=result.pending;refundMessage=result.refundedCents>0?` A ${(result.refundedCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} deposit refund was ${result.pending?"submitted":"issued"} to the original payment method.`:"";}
    catch(error){refundWarning=error instanceof Error?error.message:"The deposit refund needs owner review.";console.error("Guest revised quote refund reconciliation failed",error);}
  }else if(paidBefore>0&&quoteDepositOutstandingCents(approved)===0){approved=await markQuoteDepositSatisfied(approved.id)||approved;}
  const outstanding=quoteDepositOutstandingCents(approved);const satisfied=approved.status==="deposit-paid";
  const updated=await updateStoredRequest(guest.id,{status:satisfied?"deposit-paid":"accepted"});
  await writeAudit({actor:"customer",actorId:"guest-email",action:"quote-approved",targetType:"quote",targetId:id,summary:`Guest customer approved quote revision ${approved.revision} for ${guest.requestCode} under policy ${policy.data.policyVersion}.`,ipHash:requestIpHash(request)});
  if(updated){const notification=satisfied?`You approved quote revision ${approved.revision}. Your 50% deposit requirement is satisfied.${refundMessage}`:refundPending?`You approved quote revision ${approved.revision}.${refundMessage}`:paidBefore>0?`You approved quote revision ${approved.revision}. An additional ${(outstanding/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} deposit is required before production can begin.`:"You approved the quote and terms. The 50% deposit is now required before production can begin.";await notifyCustomer(updated,notification,{email:false});}
  if(refundWarning)return NextResponse.json({quote:approved,message:`Quote approved, but the automatic deposit refund needs owner review: ${refundWarning}`,refundWarning});
  if(satisfied)return NextResponse.json({quote:approved,message:`Quote approved. Your deposit requirement is satisfied.${refundMessage}`});
  return NextResponse.json({quote:approved,message:paidBefore>0?`Quote approved. Pay the additional ${(outstanding/100).toLocaleString("en-US",{style:"currency",currency:"USD"})} deposit to bring the upfront payment to 50%.`:"Quote approved. You can now pay the deposit."});
}

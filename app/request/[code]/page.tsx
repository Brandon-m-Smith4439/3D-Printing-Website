import Link from "next/link";
import { currentGuestRequest } from "@/lib/guest-access";
import { quoteForRequest } from "@/lib/quote-store";
import { quoteDepositOutstandingCents, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { finalInvoiceForRequest } from "@/lib/final-invoice-store";
import { shipmentForRequest } from "@/lib/shipment-store";
import { readQueue } from "@/lib/queue-store";
import { GuestRequestPortal } from "@/components/GuestRequestPortal";

export const dynamic = "force-dynamic";

export default async function GuestRequestPage({params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  const request=await currentGuestRequest();
  if(!request||request.requestCode!==code){
    return <section className="section page-hero"><div className="container"><div className="account-card guest-access-required"><p className="eyebrow">SECURE REQUEST ACCESS</p><h1>Use the private link from your email.</h1><p>This request page does not open from the request number alone. Open the latest Mesh Harbor 3D request or quote email and use its secure <strong>View My Request</strong> link.</p><p>If your link expired, reply to a Mesh Harbor 3D email and a fresh access link can be sent.</p><Link className="button button-secondary" href="/login">Sign in instead</Link></div></div></section>;
  }

  const [quote,invoice,shipment,queue]=await Promise.all([
    quoteForRequest(request.id),
    finalInvoiceForRequest(request.id),
    shipmentForRequest(request.id),
    readQueue(),
  ]);
  const job=request.queueJobId?queue.find(item=>item.id===request.queueJobId)||null:null;
  const active=queue.filter(item=>!["completed"].includes(item.status)).sort((a,b)=>a.sortOrder-b.sortOrder||a.createdAt.localeCompare(b.createdAt));
  const position=job&&job.status!=="completed"?active.findIndex(item=>item.id===job.id)+1:null;

  return <section className="section page-hero"><GuestRequestPortal
    request={{id:request.id,requestCode:request.requestCode,status:request.status,name:request.name,email:request.email,projectType:request.projectType,quantity:request.quantity,description:request.description,createdAt:request.createdAt,emailNotifications:Boolean(request.emailNotifications)}}
    quote={quote?{
      id:quote.id,revision:quote.revision,status:quote.status,basePriceCents:quote.basePriceCents,assemblyFeeCents:quote.assemblyFeeCents,rushFeeCents:quote.rushFeeCents,localDeliveryFeeCents:quote.localDeliveryFeeCents,
      fulfillmentMode:quote.fulfillmentMode,paymentMethod:quote.paymentMethod,localPaymentMethod:quote.localPaymentMethod,shippingSelection:quote.shippingSelection,totalCents:quote.totalCents,depositCents:quote.depositCents,balanceCents:quote.balanceCents,
      material:quote.material,dimensions:quote.dimensions,estimatedReadyDate:quote.estimatedReadyDate,notes:quote.notes,terms:quote.terms,
      depositPaidCents:quoteNetDepositPaidCents(quote),depositOutstandingCents:quoteDepositOutstandingCents(quote),cashFinalPaidAt:quote.cashFinalPaidAt||"",history:quote.history,
    }:null}
    queue={job?{status:job.status,position,estimatedReadyDate:job.estimatedReadyDate}:null}
    invoice={invoice?{status:invoice.status,amountDueCents:invoice.amountDueCents,amountPaidCents:invoice.amountPaidCents,amountRemainingCents:invoice.amountRemainingCents,hostedInvoiceUrl:invoice.hostedInvoiceUrl,invoicePdfUrl:invoice.invoicePdfUrl,paidAt:invoice.paidAt}:null}
    shipment={shipment?{trackingCode:shipment.trackingCode,publicTrackingUrl:shipment.publicTrackingUrl,carrier:shipment.carrier,service:shipment.service,status:shipment.status,estimatedDeliveryDate:shipment.estimatedDeliveryDate}:null}
  /></section>;
}

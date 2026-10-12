import 'server-only';
import {z} from 'zod';
import type {CommerceStore} from './store.ts';
type EmailConfig={key:string;from:string;to:string;origin:string;now:()=>Date;wait:(ms:number)=>Promise<void>};
const escapeHtml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function configuration():EmailConfig{return {key:process.env.RESEND_API_KEY||'',from:process.env.REQUEST_FROM_EMAIL||'',to:process.env.OWNER_SHIPPING_EMAIL||'',origin:process.env.NEXT_PUBLIC_SITE_URL||'',now:()=>new Date(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))};}
export async function sendCatalogLabelEmail(store:CommerceStore,orderId:string,client:typeof fetch=fetch,input:EmailConfig=configuration()):Promise<{state:'sent'|'pending'|'failed'|'uncertain';providerMessageId?:string}>{
  const to=z.email().max(160).safeParse(input.to.trim());let origin:URL;try{origin=new URL(input.origin);if(origin.protocol!=='https:'||origin.username||origin.password)throw Error();}catch{return {state:'pending'};}
  if(!to.success||!input.key||input.key.startsWith('YOUR_')||!input.from.trim()||input.from.includes('yourdomain.com'))return {state:'pending'};
  const claim=store.claimShippingEmail(orderId,input.now());if(!claim){const state=store.shippingForOrder(orderId)?.email.state;return {state:state==='sent'||state==='failed'||state==='uncertain'?state:'pending'};}
  const order=store.shippingOrder(orderId),url=new URL(`/owner/shipping/${orderId}`,origin.origin).href,items=order.items.filter(i=>!i.digital).map(i=>`${i.quantity} × ${i.name}`).join(', '),test=claim.providerMode==='test';
  const html=`<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6"><h1 style="font-size:24px">${test?'TEST shipping label':'Shipping label ready'}</h1><p>Order ${escapeHtml(orderId.slice(0,8))}: ${escapeHtml(items)}</p><p>${test?'This is a test label and cannot be used for shipping.':'Print your approved 4×6 label. The order is not marked shipped until you confirm carrier handoff.'}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 16px">Sign in to print the private label</a></p><p>The link requires your owner password and authenticator. Customer addresses and raw label links are not included in this email.</p></body></html>`;
  const text=`${test?'TEST label — not valid postage':'Shipping label ready'}\nOrder ${orderId}: ${items}\nSign in to print the private 4×6 label: ${url}\nCarrier handoff must be confirmed separately.`;
  const key=`catalog-label:${orderId}:${claim.shipmentId}`;
  let uncertain=false;
  while((store.shippingForOrder(orderId)?.email.attempts||0)<3){const attempt=store.shippingEmailAttempt(orderId,claim.email.claimId,input.now());try{const response=await client('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store',headers:{Authorization:`Bearer ${input.key}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:input.from,to:[to.data],subject:`${test?'TEST label':'Shipping label'} ready — ${orderId.slice(0,8)}`,html,text})});if(response.ok){const result=z.object({id:z.string().min(1).max(200)}).parse(await response.json());store.finishShippingEmail(orderId,claim.email.claimId,'sent',result.id);return {state:'sent',providerMessageId:result.id};}if(response.status!==429&&response.status<500){store.finishShippingEmail(orderId,claim.email.claimId,'failed','','Email configuration or request rejected. Review setup before retrying.');return {state:'failed'};}}catch{uncertain=true;}
    if(attempt.email.attempts<3)await input.wait(1000*2**(attempt.email.attempts-1));
  }
  const state=uncertain?'uncertain':'failed';store.finishShippingEmail(orderId,claim.email.claimId,state,'','Email attempt limit reached. Review delivery; no postage purchase was repeated.');return {state};
}

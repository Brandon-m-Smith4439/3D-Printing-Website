import {catalogCarrierCredential} from '@/lib/commerce/shipping-configuration.ts';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {CommerceStore} from '@/lib/commerce/store';
import {parcelSchema} from '@/lib/commerce/shipping-types';
import {getCatalogRates,purchaseCatalogLabel,reconcileCatalogLabel} from '@/lib/commerce/shipping';
import {boundedText} from '@/lib/commerce/http';
import {classifyEasyPostCredential} from '@/lib/easypost-mode';
import {getSiteContent} from '@/lib/site-content-store';
import {sendCatalogLabelEmail} from '@/lib/commerce/shipping-email';
import {writeAudit,requestIpHash} from '@/lib/audit-log';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'},json=(value:unknown,status=200)=>Response.json(value,{status,headers});
const id=z.uuid(),version=z.number().int().positive();
const commands=z.discriminatedUnion('action',[
 z.object({action:z.literal('pack'),id,parcel:parcelSchema}).strict(),
 z.object({action:z.literal('rates'),id,version}).strict(),
 z.object({action:z.literal('approve'),id,version,rateId:z.string().regex(/^rate_[A-Za-z0-9_]+$/),approvedCents:z.number().int().min(0).max(100000),confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('reconcile'),id}).strict(),
 z.object({action:z.literal('retryEmail'),id}).strict(),
 z.object({action:z.literal('handoff'),id,version,confirm:z.literal(true)}).strict(),
]);
export async function GET(r:NextRequest){if(!await requestIsOwner(r))return json({message:'Sign in required.'},401);const store=new CommerceStore();try{const ledgers=store.shippingOverview(),byId=new Map(ledgers.map(s=>[s.orderId,s]));const orders=store.overview().orders.filter(o=>o.items.some(i=>!i.digital)&&(['paid','shipped','revoked'].includes(o.status)||byId.has(o.id))).slice(0,100);return json({rows:orders.map(order=>({order,shipping:byId.get(order.id)||null})),origin:(await getSiteContent()).shippingOrigin,credentialMode:classifyEasyPostCredential(catalogCarrierCredential(process.env)||''),liveEnabled:/^(true|1|yes|on)$/i.test(process.env.EASYPOST_LIVE_ENABLED||'')});}finally{store.close();}}
export async function POST(r:NextRequest){
 if(!await requestIsOwner(r))return json({message:'Sign in required.'},401);
 if(!sameOrigin(r))return json({message:'Origin rejected.'},403);
 let body:unknown;try{body=JSON.parse(await boundedText(r,4000));}catch{return json({message:'Invalid shipping command.'},400);}
 const parsed=commands.safeParse(body);if(!parsed.success)return json({message:'Check the order, package measurements and exact approval.'},400);
 const store=new CommerceStore();try{
  const v=parsed.data;let result;
  if(v.action==='retryEmail'){const email=await sendCatalogLabelEmail(store,v.id);return json({email,shipping:store.shippingForOrder(v.id),message:`Owner label email: ${email.state}. Check recipient/sending configuration if pending; no postage purchase was attempted.`});}
  if(v.action==='pack')result=store.packOrder(v.id,v.parcel);
  else if(v.action==='rates')result=await getCatalogRates(store,v.id,v.version);
  else if(v.action==='approve')result=await purchaseCatalogLabel(store,{orderId:v.id,version:v.version,rateId:v.rateId,approvedCents:v.approvedCents});
  else if(v.action==='reconcile')result=await reconcileCatalogLabel(store,v.id);
  else result=store.handoffShipping(v.id,v.version);
  let message=result.state==='reconcile'?'Outcome needs reconciliation. No second purchase will be attempted.':'Shipping record saved.';
  if((v.action==='approve'||v.action==='reconcile')&&result.state==='label-ready'){try{const email=await sendCatalogLabelEmail(store,v.id);message+=` Owner label email: ${email.state}.`;}catch{message+=' Owner label email needs review; the label record is saved. Do not repeat postage purchase.';}}
  await writeAudit({actor:'owner',actorId:'owner',action:`catalog-shipping-${v.action}`,targetType:'order',targetId:v.id,summary:`Catalog shipping ${v.action}: ${result.state}${v.action==='approve'?`; exact approved postage ${v.approvedCents} cents`:''}.`,ipHash:requestIpHash(r)}).catch(()=>undefined);
  return json({shipping:store.shippingForOrder(v.id)||result,message});
 }catch(error){
  // Diagnostic categories and schema field names only: never addresses, keys or provider payloads.
  if(process.env.COMMERCE_SHIPPING_SANDBOX_ENABLED==='true')console.warn('Catalog shipping sandbox rejection',{action:parsed.data.action,type:error instanceof z.ZodError?'validation':'operation',fields:error instanceof z.ZodError?error.issues.map(issue=>issue.path.join('.')):[],stage:error instanceof Error&&'shippingStage' in error?String(error.shippingStage):'context-or-store'});
  return json({message:'Shipping action rejected. Refresh the order; check its payment, package, rate version and carrier mode. Existing purchases require reconciliation.'},409);
 }finally{store.close();}
}

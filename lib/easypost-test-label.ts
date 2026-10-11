import 'server-only';
import {z} from 'zod';
import {classifyEasyPostCredential} from './easypost-mode.ts';

const rateSchema=z.object({id:z.string().min(1),carrier:z.literal('USPS'),service:z.string().min(1),rate:z.string().regex(/^\d+(\.\d{1,2})?$/)});
const labelUrl=z.url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&/^easypost-files(?:\.[a-z0-9-]+)*\.amazonaws\.com$/.test(url.hostname);});
export async function createTestLabel(key:string,client:typeof fetch=fetch) {
  if(classifyEasyPostCredential(key)!=='test')throw Error('An EasyPost test key is required; live credentials are refused.');
  async function post(url:string,payload:unknown){
    const response=await client(url,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(key.trim()+':').toString('base64')}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!response.ok)throw Error('EasyPost test request failed. Check the test key and test carrier configuration.');
    return response.json();
  }
  // Disposable carrier fixtures, never customer/owner data or real order packaging.
  const raw=await post('https://api.easypost.com/v2/shipments',{shipment:{from_address:{name:'Test Fixture Sender',street1:'417 Montgomery St',city:'San Francisco',state:'CA',zip:'94104',country:'US'},to_address:{name:'Test Fixture Recipient',street1:'388 Townsend St',city:'San Francisco',state:'CA',zip:'94107',country:'US'},parcel:{weight:4,length:6,width:4,height:2},options:{currency:'USD',label_format:'PNG',label_size:'4x6'}}});
  const shipment=z.object({id:z.string().regex(/^shp_[A-Za-z0-9_]+$/),mode:z.literal('test'),rates:z.array(z.unknown())}).safeParse(raw);
  if(!shipment.success)throw Error('EasyPost response mode or shipment data did not match test mode.');
  const rates=shipment.data.rates.flatMap(value=>{const parsed=rateSchema.safeParse(value);return parsed.success?[parsed.data]:[];}).sort((a,b)=>Number(a.rate)-Number(b.rate));
  const selected=rates[0];if(!selected)throw Error('No USPS test rate returned; no label requested.');
  const purchased=z.object({id:z.literal(shipment.data.id),mode:z.literal('test'),tracking_code:z.string().min(1),postage_label:z.object({label_url:labelUrl})}).parse(await post(`https://api.easypost.com/v2/shipments/${shipment.data.id}/buy`,{rate:{id:selected.id}}));
  return {testOnly:true as const,labelFormat:'PNG',labelSize:'4x6',shipmentId:purchased.id,trackingCode:purchased.tracking_code,carrier:selected.carrier,service:selected.service,rateCents:Math.round(Number(selected.rate)*100),labelUrl:purchased.postage_label.label_url,warning:'Test-only fixture label. No real postage or customer order; this label cannot be used for shipping.'};
}


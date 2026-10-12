import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {CenterStore} from '@/lib/ai-center/store';
import {materialPlanSchema,profileIdSchema,slicingConfigSchema} from '@/lib/ai-center/slicing-types';
import {findBambuCatalogItem} from '@/lib/pricing-store';
import {readFilamentPurchaseLots} from '@/lib/bambu-purchase-store';
import {resolveMaterialCost} from '@/lib/material-cost-resolver';
import {proposePacking,proposeSales} from '@/lib/ai-center/slicing-proposals';
import {createHash} from 'node:crypto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
const project={id:z.uuid(),version:z.number().int().positive()};
const commands=z.discriminatedUnion('action',[
 z.object({action:z.literal('enqueue'),...project,quantity:z.number().int().min(1).max(100),profileId:profileIdSchema,materialPlan:materialPlanSchema}).strict(),
 z.object({action:z.literal('material'),...project,materialPlan:materialPlanSchema}).strict(),
 z.object({action:z.literal('acceptEstimate'),...project,jobId:z.uuid()}).strict(),
 z.object({action:z.literal('cancel'),jobId:z.uuid()}).strict(),
 z.object({action:z.literal('retry'),jobId:z.uuid()}).strict(),
 z.object({action:z.literal('measureMass'),jobId:z.uuid(),grams:z.number().positive().max(10000),confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal('proposal'),...project,jobId:z.uuid(),startupWasteGrams:z.number().min(0).max(1000)}).strict(),
 z.object({action:z.literal('acceptCosts'),...project,jobId:z.uuid(),startupWasteGrams:z.number().min(0).max(1000),proposalHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('pair')}).strict(),z.object({action:z.literal('revoke'),workerId:z.uuid()}).strict(),
 z.object({action:z.literal('configure'),config:slicingConfigSchema}).strict(),
]);
export async function GET(request:NextRequest){if(!await requestIsOwner(request))return reply({message:'Sign in required'},401);const s=new CenterStore();try{return reply({enabled:process.env.AI_CENTER_SLICING_ENABLED==='true',...s.slicing.snapshot(),projects:s.snapshot().projects});}finally{s.close();}}
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return reply({message:'Origin rejected'},403);
 if(!await requestIsOwner(request))return reply({message:'Sign in required'},401);
 let c:z.infer<typeof commands>;
 try{const raw=await request.text();if(Buffer.byteLength(raw)>20000)return reply({message:'Too large'},413);c=commands.parse(JSON.parse(raw));}catch{return reply({message:'Invalid command'},400);}
 if(process.env.AI_CENTER_SLICING_ENABLED!=='true')return reply({message:'Local slicing is disabled; deployment setup required'},409);
 const s=new CenterStore();try{
  if(c.action==='pair')return reply(s.slicing.pair());
  if(c.action==='revoke')s.slicing.revoke(c.workerId);
  else if(c.action==='configure')s.slicing.configure(c.config);
  else if(c.action==='cancel')s.slicing.cancel(c.jobId);
  else if(c.action==='retry')s.retrySlice(c.jobId);
  else if(c.action==='measureMass')s.recordSlicePartMass(c.jobId,c.grams);
  else if(c.action==='proposal'||c.action==='acceptCosts'){
   const p=s.product(c.id,c.version),{job:j,config,contextHash}=s.slicing.proposalContext(c.jobId);
   if(p.sliceEstimate?.jobId!==j.id||p.revisions.at(-1)?.id!==j.input.revisionId||j.state!=='completed'||!j.result||JSON.stringify(p.materialPlan)!==JSON.stringify(j.input.materialPlan)||config.profileHashes[j.input.profileId]!==j.input.profileHash)throw Error('Accept a current revision estimate first');
   const pack=proposePacking(j.result,j.input.quantity,config.presets,config.massAllowanceGrams,j.measuredPartMass?.grams);
   const lots=await readFilamentPurchaseLots(),materials=[];
   for(const line of j.input.materialPlan.lines){const item=await findBambuCatalogItem(line.catalogItemId);if(item?.active)materials.push({slot:line.slot,cost:resolveMaterialCost(item,lots),startupWasteGrams:c.startupWasteGrams});}
   const pricing=p.sales&&j.input.quantity===1?proposeSales(j.result,p.sales,materials,pack):null,proposalHash=createHash('sha256').update(JSON.stringify({pack,pricing,jobId:j.id,contextHash,measuredPartMass:j.measuredPartMass??null})).digest('hex');
   if(c.action==='acceptCosts'){if(!pricing||c.proposalHash!==proposalHash||contextHash!==s.slicing.contextHash(j.id))throw Error('Proposal changed or lacks single-unit costing; review current costs first');s.acceptSliceCosts(c.id,c.version,pricing.input,{jobId:j.id,contextHash,proposalHash,at:new Date().toISOString(),materialSources:materials.map(m=>({slot:m.slot,source:m.cost.source,costPerGramMicros:m.cost.costPerGramMicros}))});return reply({message:'Reviewed estimates saved to Sales preparation; physical test and release approval remain required'});}
   return reply({pack,pricing,proposalHash,message:p.sales?'Review the estimates before accepting them into Sales preparation.':'Configure explicit full costs and channel fees in Sales preparation first.',materialSources:materials.map(m=>({slot:m.slot,source:m.cost.source,costPerGramMicros:m.cost.costPerGramMicros})),weightSource:j.measuredPartMass?'owner-measured part':'slicer deposited mass or unavailable'});
  }
  else if(c.action==='material')s.setSliceMaterial(c.id,c.version,c.materialPlan);
  else if(c.action==='acceptEstimate')s.acceptSlice(c.id,c.version,c.jobId);
  else return reply({job:s.enqueueSlice(c.id,c.version,c.quantity,c.profileId,c.materialPlan)});
  return reply({message:'Saved'});
 }catch(e){return reply({message:e instanceof Error?e.message.slice(0,300):'Could not complete command'},409);}finally{s.close();}
}

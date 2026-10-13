import {NextRequest} from 'next/server';
import {z} from 'zod';
import {OWNER_COOKIE} from '@/lib/owner-auth';
import {CenterStore} from '@/lib/ai-center/store';
import {MarketplaceStore} from '@/lib/marketplace/store';
import {beginAuthorization,connectionConfiguration,exportListing,observeMarket,readOwnSales,salesRequestSchema} from '@/lib/marketplace/etsy';
import {commandText,marketplaceFailure,marketplaceJson,ownerGate} from '@/lib/marketplace/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const commands=z.discriminatedUnion('action',[
 z.object({action:z.literal('connect'),writeAccess:z.boolean().optional()}).strict(),z.object({action:z.literal('disconnect')}).strict(),
 z.object({action:z.literal('research'),keywords:z.string().trim().min(1).max(120)}).strict(),
 z.object({action:z.literal('sales'),options:salesRequestSchema}).strict(),
 z.object({action:z.literal('export'),projectId:z.uuid(),version:z.number().int().positive(),format:z.enum(['physical','digital'])}).strict(),
]);
export async function GET(request:NextRequest){const denied=await ownerGate(request);if(denied)return denied;let store:MarketplaceStore|undefined,center:CenterStore|undefined;try{store=new MarketplaceStore();center=new CenterStore();const eligibleProjectIds=center.snapshot().projects.filter(p=>p.stage==='release'&&center!.projectJobs(p.id).some(j=>j.key===`project-${p.id}-${p.version}-listing`&&j.kind==='listing'&&j.status==='ready')).map(p=>p.id);return marketplaceJson({configuration:connectionConfiguration(),connection:store.status(),reports:store.reports(),eligibleProjectIds});}catch{return marketplaceJson({message:'Marketplace storage or encryption configuration unavailable.'},503);}finally{center?.close();store?.close();}}
export async function POST(request:NextRequest){const denied=await ownerGate(request,true);if(denied)return denied;let command:z.infer<typeof commands>;try{command=commands.parse(await commandText(request));}catch{return marketplaceJson({message:'Invalid marketplace command.'},400);}let store:MarketplaceStore|undefined;try{
 if(command.action==='export'){const center=new CenterStore();try{const snapshot=center.snapshot(),project=snapshot.projects.find(p=>p.id===command.projectId);if(!project||project.version!==command.version)return marketplaceJson({message:'Project changed; refresh before export.'},409);const listing=exportListing(project,center.projectJobs(project.id),command.format);return marketplaceJson({listing});}finally{center.close();}}
 store=new MarketplaceStore();if(command.action==='connect')return marketplaceJson(beginAuthorization(store,request.cookies.get(OWNER_COOKIE)!.value,Date.now(),command.writeAccess===true));
 if(command.action==='disconnect'){store.disconnect();return marketplaceJson({message:'Local authorization removed. Revoke app access in Etsy to invalidate Etsy-issued tokens.'});}
 if(command.action==='research')return marketplaceJson({report:await observeMarket(store,command.keywords)});
 return marketplaceJson({report:await readOwnSales(store,command.options)});
 }catch(e){return marketplaceFailure(e);}finally{store?.close();}}

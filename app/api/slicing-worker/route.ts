import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {CenterStore} from '@/lib/ai-center/store';
import {sliceResultSchema} from '@/lib/ai-center/slicing-types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('claim')}).strict(),z.object({action:z.literal('heartbeat')}).strict(),z.object({action:z.literal('complete'),claimId:z.uuid(),result:sliceResultSchema}).strict(),z.object({action:z.literal('fail'),claimId:z.uuid()}).strict()]);
const reply=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
export async function POST(request:NextRequest){
 const s=new CenterStore();try{
  let workerId:string;try{workerId=s.slicing.authenticate((request.headers.get('authorization')||'').replace(/^Bearer /,''));}catch{return reply({message:'Invalid worker credential'},401);}
  if(process.env.AI_CENTER_SLICING_ENABLED!=='true')return reply({message:'Worker disabled'},409);
  let c:z.infer<typeof schema>;try{const raw=await request.text();if(Buffer.byteLength(raw)>20000)return reply({message:'Too large'},413);c=schema.parse(JSON.parse(raw));}catch{return reply({message:'Invalid command'},400);}
  if(['claim','heartbeat'].includes(c.action)){try{s.slicing.limit(workerId,c.action);}catch{return reply({message:'Rate limited'},429);}}
  if(c.action==='heartbeat'){s.slicing.heartbeat(workerId);return reply({message:'Recorded'});}
  if(c.action==='claim')return reply({claim:s.slicing.claim(workerId)});
  if(c.action==='complete')s.finishSlice(workerId,c.claimId,c.result);
  else s.slicing.fail(workerId,c.claimId,'Local slice failed');
  return reply({message:'Recorded'});
 }catch{return reply({message:'Claim failed or changed; check current task'},409);}finally{s.close();}
}

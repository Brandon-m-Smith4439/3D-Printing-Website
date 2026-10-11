import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {MeshyStore,meshRequest,runMeshyOne} from '@/lib/ai-center/meshy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers});
const commands=z.discriminatedUnion('action',[
 z.object({action:z.literal('enqueue'),request:meshRequest}).strict(),
 z.object({action:z.literal('repair'),id:z.uuid()}).strict(),
 z.object({action:z.literal('remesh'),id:z.uuid()}).strict(),
 z.object({action:z.literal('approve'),id:z.uuid(),reject:z.boolean().optional()}).strict(),
 z.object({action:z.literal('import'),id:z.uuid()}).strict(),
 z.object({action:z.literal('run')}).strict(),
]);
export async function GET(req:NextRequest){if(!await requestIsOwner(req))return json({message:'Sign in required.'},401);const store=new MeshyStore();try{return json(store.snapshot());}finally{store.close();}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return json({message:'Origin rejected.'},403);
 if(!await requestIsOwner(req))return json({message:'Sign in required.'},401);
 if(Number(req.headers.get('content-length')||0)>4000)return json({message:'Request too large.'},413);
 let command:z.infer<typeof commands>;try{const text=await req.text();if(Buffer.byteLength(text)>4000)return json({message:'Request too large.'},413);command=commands.parse(JSON.parse(text));}catch{return json({message:'Invalid Meshy command.'},400);}
 const store=new MeshyStore();try{
  if(command.action==='enqueue')store.enqueue(command.request);
  else if(command.action==='approve')store.approve(command.id,command.reject);
  else if(command.action==='repair'||command.action==='remesh'){const j=store.get(command.id);store.enqueue({projectId:j.projectId,version:j.version,prompt:j.prompt,longestSideMm:j.longestSideMm},j.id,command.action);}
  else if(command.action==='import'){
   const check=store.snapshot().jobs.find(j=>j.id===command.id)?.importCheck;
   if(check&&!check.ready)return json({message:`Import blocked: ${check.reason} Download the private STL, simplify or repair it in your slicer, and upload a new revision. An original generation also offers a separately approved 5-credit remesh.`},409);
   store.importRevision(command.id);
  }
  else await runMeshyOne(store);
  return json({message:'Saved. Refresh for current Meshy status.'});
 }catch{return json({message:'Meshy action could not complete. Check approval, project version, credit cap and provider setup. Imports require a valid binary STL up to 1 MB; otherwise download and refine in your slicer.'},409);}finally{store.close();}
}

import {MeshyStore} from '@/lib/ai-center/meshy';
import {z} from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const headers={'Cache-Control':'no-store'};
 if(process.env.AI_CENTER_MESHY_ENABLED!=='true')return new Response(null,{status:202,headers});
 if(Number(req.headers.get('content-length')||0)>16000)return new Response(null,{status:413,headers});
 const reader=req.body?.getReader();if(!reader)return new Response(null,{status:400,headers});let bytes=0;const chunks:Uint8Array[]=[];
 try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>16000)return new Response(null,{status:413,headers});chunks.push(p.value);}}finally{await reader.cancel();}
 let id:string;try{id=z.uuid().parse(JSON.parse(Buffer.concat(chunks).toString()).id);}catch{return new Response(null,{status:400,headers});}
 const store=new MeshyStore();try{store.notify(id);return new Response(null,{status:202,headers});}finally{store.close();}
}

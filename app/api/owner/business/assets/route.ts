import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {CenterStore} from '@/lib/ai-center/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const json=(message:string,status:number)=>NextResponse.json({message},{status,headers});
export async function GET(request:NextRequest){
 if(!await requestIsOwner(request))return json('Sign in required.',401);
 const id=z.uuid().safeParse(request.nextUrl.searchParams.get('id'));if(!id.success)return json('Invalid file.',400);
 let store:CenterStore|undefined;
 try{store=new CenterStore();const asset=store.projectAsset(id.data);return new NextResponse(new Uint8Array(asset.data),{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${asset.filename}"`}});}
 catch{return json('File unavailable.',404);}finally{store?.close();}
}
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return json('Origin rejected.',403);
 if(!await requestIsOwner(request))return json('Sign in required.',401);
 const query=z.object({id:z.uuid(),version:z.coerce.number().int().positive(),filename:z.string().max(104),notes:z.string().trim().min(1).max(2000)}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!query.success)return json('Invalid revision details.',400);
 if(Number(request.headers.get('content-length')||0)>1_000_000)return json('STL limit is 1 MB.',413);
 // Bound reads even when Content-Length is absent or dishonest.
 const reader=request.body?.getReader();if(!reader)return json('STL required.',400);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();return json('STL limit is 1 MB.',413);}chunks.push(value);}}catch{return json('Upload interrupted.',400);}
 let store:CenterStore|undefined;
 try{store=new CenterStore();const v=query.data;store.addRevision(v.id,v.version,v.filename,v.notes,Buffer.concat(chunks));return json('Revision saved. Slice and physically test this exact file.',200);}
 catch{return json('Revision rejected. Refresh the project; use a closed, consistently oriented STL under 1 MB.',409);}finally{store?.close();}
}

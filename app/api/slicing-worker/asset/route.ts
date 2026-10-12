import {NextRequest,NextResponse} from 'next/server';
import {CenterStore} from '@/lib/ai-center/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(request:NextRequest){const s=new CenterStore();try{
 let workerId:string;try{workerId=s.slicing.authenticate((request.headers.get('authorization')||'').replace(/^Bearer /,''));}catch{return NextResponse.json({message:'Invalid worker credential'},{status:401,headers});}
 if(process.env.AI_CENTER_SLICING_ENABLED!=='true')return NextResponse.json({message:'Disabled'},{status:409,headers});
 const asset=s.sliceAsset(workerId,request.nextUrl.searchParams.get('claimId')||'');
 return new NextResponse(new Uint8Array(asset.data),{headers:{...headers,'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({message:'Asset unavailable for this claim'},{status:409,headers});}finally{s.close();}}

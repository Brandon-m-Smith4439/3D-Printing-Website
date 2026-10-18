import {NextRequest,NextResponse} from 'next/server';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {createTestLabel} from '@/lib/easypost-test-label';
import {classifyEasyPostCredential} from '@/lib/easypost-mode';
export const runtime='nodejs';export const dynamic='force-dynamic';
let lastAttempt=0;
export async function POST(request:NextRequest){
  const headers={'Cache-Control':'no-store'};
  if(!sameOrigin(request))return NextResponse.json({message:'Origin rejected.'},{status:403,headers});
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401,headers});
  const key=process.env.EASYPOST_API_KEY||'';
  if(classifyEasyPostCredential(key)!=='test')return NextResponse.json({message:'A test EasyPost key is required. This check refuses production credentials.'},{status:409,headers});
  if(Date.now()-lastAttempt<60000)return NextResponse.json({message:'Wait one minute before another test-label attempt.'},{status:429,headers});
  lastAttempt=Date.now();
  try{return NextResponse.json(await createTestLabel(key),{headers});}
  catch{return NextResponse.json({message:'The carrier test did not complete. Check the EasyPost test key, USPS carrier and test shipments dashboard. No live label was requested.'},{status:503,headers});}
}

import {NextRequest,NextResponse} from 'next/server';
import {requestIsOwner} from '@/lib/owner-auth';
import {launchReadiness} from '@/lib/ai-center/readiness';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
 if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401,headers});
 return NextResponse.json(launchReadiness(),{headers});
}

import {NextRequest,NextResponse} from 'next/server';
import {requestIsOwner} from '@/lib/owner-auth';
import {sameOrigin} from '@/lib/owner-api';
import {backupSidecars} from '../../../../../scripts/center-backups.mjs';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
 if(!sameOrigin(request))return NextResponse.json({message:'Origin rejected.'},{status:403,headers});
 if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401,headers});
 try{const result=await backupSidecars();return NextResponse.json({message:`Snapshot saved for ${result.files.length} control center databases. Export it to secure off-site storage.`,createdAt:result.createdAt,files:result.files},{headers});}
 catch{return NextResponse.json({message:'Backup failed. Review volume space and backup configuration.'},{status:503,headers});}
}

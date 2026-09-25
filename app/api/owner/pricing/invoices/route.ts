import { NextRequest,NextResponse } from 'next/server';
import { requestIsOwner } from '@/lib/owner-auth';
import { readBambuInvoiceImports } from '@/lib/bambu-invoice-store';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
  const items=(await readBambuInvoiceImports()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({privateObjectKey:_private,...safe})=>safe);
  return NextResponse.json({invoices:items},{headers:{'Cache-Control':'no-store'}});
}

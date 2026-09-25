import { NextRequest,NextResponse } from 'next/server';
import { requestIsOwner } from '@/lib/owner-auth';
import { sameOrigin } from '@/lib/owner-api';
import { postBambuInvoiceImport } from '@/lib/bambu-invoice-service';
import { readPricingSettings } from '@/lib/pricing-store';
import { requestIpHash,writeAudit } from '@/lib/audit-log';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:'Request origin was not accepted.'},{status:403});
  const {id}=await context.params;
  try{const settings=await readPricingSettings();const result=await postBambuInvoiceImport(id,settings);await writeAudit({actor:'owner',actorId:'owner',action:'bambu-invoice-posted',targetType:'pricing-invoice',targetId:id,summary:`Posted Bambu invoice ${result.importRecord.orderNumber||result.importRecord.originalFileName} with ${result.lots.length} filament purchase lot${result.lots.length===1?'':'s'}.`,ipHash:requestIpHash(request)});return NextResponse.json({message:'Bambu invoice posted to material purchase history.',lotCount:result.lots.length});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:'Bambu invoice could not be posted.'},{status:409});}
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requestIsOwner } from '@/lib/owner-auth';
import { sameOrigin } from '@/lib/owner-api';
import { deletePrivateObject, privateObjectPath, putPrivateObject } from '@/lib/private-object-store';
import { malwareScanPrivateFile } from '@/lib/file-malware-scan';
import { extractPdfText, isPdfBytes } from '@/lib/pdf-text';
import { ensureBambuCatalogSeeded, readBambuCatalog } from '@/lib/pricing-store';
import { parseBambuInvoiceText } from '@/lib/bambu-invoice-parser';
import { bambuInvoiceDuplicateReason, createBambuInvoiceImport } from '@/lib/bambu-invoice-store';
import { requestIpHash, writeAudit } from '@/lib/audit-log';

export const runtime='nodejs';
const MAX_BYTES=10*1024*1024;
function safeName(value:string){return value.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120)||'bambu-invoice.pdf';}

export async function POST(request:NextRequest){
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:'Request origin was not accepted.'},{status:403});
  const length=Number(request.headers.get('content-length')||'0');
  if(length>MAX_BYTES+500_000)return NextResponse.json({message:'Invoice PDF is too large. Maximum is 10 MB.'},{status:413});
  let form:FormData;try{form=await request.formData();}catch{return NextResponse.json({message:'Invalid invoice upload.'},{status:400});}
  const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({message:'Choose a Bambu invoice PDF.'},{status:400});
  if(file.size<1||file.size>MAX_BYTES)return NextResponse.json({message:'Invoice PDF must be 10 MB or smaller.'},{status:413});
  const bytes=Buffer.from(await file.arrayBuffer());
  if(file.type!=='application/pdf'||!isPdfBytes(bytes))return NextResponse.json({message:'Only a valid PDF invoice is accepted.'},{status:415});
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(await bambuInvoiceDuplicateReason(sha256,''))return NextResponse.json({message:'This invoice file has already been imported.'},{status:409});
  const objectKey=`pricing-invoices/${randomBytes(18).toString('hex')}.pdf`;
  await putPrivateObject(objectKey,bytes);
  try{
    await malwareScanPrivateFile(privateObjectPath(objectKey));
    await ensureBambuCatalogSeeded();
    const catalog=await readBambuCatalog();
    let extracted='';
    try{extracted=await extractPdfText(bytes);}catch(error){
      await deletePrivateObject(objectKey);
      return NextResponse.json({message:error instanceof Error?error.message:'Invoice PDF could not be read.'},{status:422});
    }
    const parsed=extracted.length>=40?parseBambuInvoiceText(extracted,catalog):{orderNumber:'',orderDate:'',subtotalCents:0,discountCents:0,shippingCents:0,taxCents:0,totalCents:0,lines:[],warnings:['PDF contains insufficient machine-readable text; enter the purchase manually.'],parseStatus:'review-required' as const};
    const duplicate=await bambuInvoiceDuplicateReason(sha256,parsed.orderNumber);
    if(duplicate){await deletePrivateObject(objectKey);return NextResponse.json({message:duplicate==='order-number'?'This Bambu order number has already been imported.':'This invoice file has already been imported.'},{status:409});}
    const now=new Date().toISOString();
    const record=await createBambuInvoiceImport({id:randomUUID(),originalFileName:safeName(file.name),privateObjectKey:objectKey,sha256,orderNumber:parsed.orderNumber,orderDate:parsed.orderDate,subtotalCents:parsed.subtotalCents,discountCents:parsed.discountCents,shippingCents:parsed.shippingCents,taxCents:parsed.taxCents,totalCents:parsed.totalCents,parseStatus:parsed.parseStatus,parserVersion:'1',rawLineCount:parsed.lines.length,matchedFilamentLineCount:parsed.lines.filter(line=>line.isFilament&&line.catalogItemId).length,unmatchedLineCount:parsed.lines.filter(line=>line.isFilament&&!line.catalogItemId).length,warnings:parsed.warnings,lines:parsed.lines,createdAt:now,updatedAt:now,postedAt:''});
    await writeAudit({actor:'owner',actorId:'owner',action:'bambu-invoice-uploaded',targetType:'pricing-invoice',targetId:record.id,summary:`Bambu invoice ${record.orderNumber||record.originalFileName} uploaded for review.`,ipHash:requestIpHash(request)});
    const safe={...record};delete (safe as Partial<typeof record>).privateObjectKey;
    return NextResponse.json({invoice:safe},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    await deletePrivateObject(objectKey);
    return NextResponse.json({message:error instanceof Error?error.message:'Invoice upload was rejected.'},{status:process.env.NODE_ENV==='production'?503:400});
  }
}

import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { requestIsOwner } from '@/lib/owner-auth';
import { sameOrigin } from '@/lib/owner-api';
import { findBambuInvoiceImport, updateBambuInvoiceImport } from '@/lib/bambu-invoice-store';
import { ensureBambuCatalogSeeded, readBambuCatalog } from '@/lib/pricing-store';
import { requestIpHash,writeAudit } from '@/lib/audit-log';
const lineSchema=z.object({id:z.string().min(1),catalogItemId:z.string().max(120),packageType:z.enum(['refill','with-spool','filament-only']).optional(),netWeightGramsPerUnit:z.number().int().min(0).max(10000).optional()}).strict();
const patchSchema=z.object({lines:z.array(lineSchema).min(1).max(100)}).strict();
function safe(record:NonNullable<Awaited<ReturnType<typeof findBambuInvoiceImport>>>){const {privateObjectKey:_private,...result}=record;return result;}
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});const {id}=await context.params;const item=await findBambuInvoiceImport(id);if(!item)return NextResponse.json({message:'Invoice import not found.'},{status:404});return NextResponse.json({invoice:safe(item)},{headers:{'Cache-Control':'no-store'}});}
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:'Sign in required.'},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:'Request origin was not accepted.'},{status:403});
  const {id}=await context.params;const item=await findBambuInvoiceImport(id);if(!item)return NextResponse.json({message:'Invoice import not found.'},{status:404});if(item.parseStatus==='posted')return NextResponse.json({message:'Posted invoices cannot be edited.'},{status:409});
  const parsed=patchSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:'Check the invoice line mappings.'},{status:400});
  await ensureBambuCatalogSeeded();const catalog=await readBambuCatalog();const byId=new Map(catalog.map(row=>[row.id,row]));const patches=new Map(parsed.data.lines.map(line=>[line.id,line]));
  const lines=item.lines.map(line=>{const patch=patches.get(line.id);if(!patch)return line;if(patch.catalogItemId){const cat=byId.get(patch.catalogItemId);if(!cat)throw new Error('Selected Bambu catalog item was not found.');return {...line,catalogItemId:cat.id,isFilament:true,packageType:patch.packageType||cat.packageType,netWeightGramsPerUnit:patch.netWeightGramsPerUnit??cat.netWeightGrams};}return {...line,catalogItemId:'',packageType:patch.packageType||line.packageType,netWeightGramsPerUnit:patch.netWeightGramsPerUnit??line.netWeightGramsPerUnit};});
  const unmatched=lines.filter(line=>line.isFilament&&!line.catalogItemId).length;const persistentWarnings=item.warnings.filter(warning=>!/needs catalog review/i.test(warning));const parseStatus=unmatched===0&&persistentWarnings.length===0?'parsed':'review-required';
  const updated=await updateBambuInvoiceImport(id,{lines,matchedFilamentLineCount:lines.filter(line=>line.isFilament&&line.catalogItemId).length,unmatchedLineCount:unmatched,warnings:persistentWarnings,parseStatus});
  await writeAudit({actor:'owner',actorId:'owner',action:'bambu-invoice-reviewed',targetType:'pricing-invoice',targetId:id,summary:`Reviewed Bambu invoice ${updated.orderNumber||updated.originalFileName}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({invoice:safe(updated),message:'Invoice mappings saved.'},{headers:{'Cache-Control':'no-store'}});
}

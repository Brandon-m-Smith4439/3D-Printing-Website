import 'server-only';
import { readCollection, writeCollection } from './database.ts';
import type { BambuInvoiceImport } from './bambu-invoice-types.ts';

const COLLECTION='bambu-invoice-imports';
let chain=Promise.resolve();
function mutate<T>(fn:()=>Promise<T>){const next=chain.then(fn,fn);chain=next.then(()=>undefined,()=>undefined);return next;}
export async function readBambuInvoiceImports(){return readCollection<BambuInvoiceImport>(COLLECTION);}
export async function findBambuInvoiceImport(id:string){return (await readBambuInvoiceImports()).find(item=>item.id===id)||null;}
export async function bambuInvoiceDuplicateReason(sha256:string,orderNumber:string){
  const items=await readBambuInvoiceImports();
  if(sha256&&items.some(item=>item.sha256===sha256))return 'file-hash' as const;
  if(orderNumber&&items.some(item=>item.orderNumber===orderNumber&&item.parseStatus==='posted'))return 'order-number' as const;
  if(orderNumber&&items.some(item=>item.orderNumber===orderNumber))return 'order-number' as const;
  return '' as const;
}
export function createBambuInvoiceImport(record:BambuInvoiceImport){return mutate(async()=>{
  const items=await readBambuInvoiceImports();
  if(items.some(item=>item.id===record.id||item.sha256===record.sha256||(record.orderNumber&&item.orderNumber===record.orderNumber)))throw new Error('Duplicate Bambu invoice import.');
  items.push(record);await writeCollection(COLLECTION,items);return record;
});}
export function updateBambuInvoiceImport(id:string,patch:Partial<BambuInvoiceImport>){return mutate(async()=>{
  const items=await readBambuInvoiceImports();const index=items.findIndex(item=>item.id===id);if(index<0)throw new Error('Bambu invoice import not found.');
  items[index]={...items[index],...patch,id,updatedAt:new Date().toISOString()};await writeCollection(COLLECTION,items);return items[index];
});}

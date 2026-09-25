import 'server-only';
import { readCollection, writeCollection } from './database.ts';
import type { FilamentPurchaseLot } from './pricing-types.ts';

const COLLECTION='filament-purchase-lots';
let mutationChain=Promise.resolve();
function mutate<T>(op:()=>Promise<T>):Promise<T>{const next=mutationChain.then(op,op);mutationChain=next.then(()=>undefined,()=>undefined);return next;}

export async function readFilamentPurchaseLots(){
  return (await readCollection<FilamentPurchaseLot>(COLLECTION)).sort((a,b)=>a.orderDate.localeCompare(b.orderDate)||a.createdAt.localeCompare(b.createdAt));
}

export function writePostedPurchaseLots(importId:string,lots:FilamentPurchaseLot[]){
  return mutate(async()=>{
    if(!importId) throw new Error('Invoice import ID is required.');
    const current=await readFilamentPurchaseLots();
    if(current.some(x=>x.invoiceImportId===importId)) throw new Error('Purchase lots already exist for this invoice import.');
    const ids=new Set(current.map(x=>x.id));
    for(const lot of lots){
      if(lot.invoiceImportId!==importId) throw new Error('Purchase lot import ID does not match the posted invoice.');
      if(ids.has(lot.id)) throw new Error('Purchase lot ID already exists.');
      ids.add(lot.id);
    }
    await writeCollection(COLLECTION,[...current,...lots]);
    return lots;
  });
}

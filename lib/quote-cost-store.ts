import 'server-only';
import { readCollection, writeCollection } from './database.ts';
import type { QuoteCostSnapshot } from './pricing-types.ts';

const COLLECTION='quote-cost-snapshots';
let chain=Promise.resolve();
function mutate<T>(fn:()=>Promise<T>){const next=chain.then(fn,fn);chain=next.then(()=>undefined,()=>undefined);return next;}

export async function readCostSnapshots(){return readCollection<QuoteCostSnapshot>(COLLECTION);}
export function saveCostSnapshot(snapshot:QuoteCostSnapshot){return mutate(async()=>{
  const items=await readCostSnapshots();
  const index=items.findIndex(item=>item.id===snapshot.id);
  if(index>=0&&items[index].status==='finalized')throw new Error('Finalized cost snapshot must be reopened before editing.');
  const now=new Date().toISOString();
  const next={...snapshot,createdAt:index>=0?items[index].createdAt:(snapshot.createdAt||now),updatedAt:now};
  if(index>=0)items[index]=next;else items.push(next);
  await writeCollection(COLLECTION,items);
  return next;
});}
export async function costSnapshotsForRequest(requestId:string){return (await readCostSnapshots()).filter(item=>item.requestId===requestId).sort((a,b)=>a.quoteRevision-b.quoteRevision||a.status.localeCompare(b.status));}
export async function latestCostingForRequest(requestId:string){
  const items=await costSnapshotsForRequest(requestId);
  return [...items].sort((a,b)=>b.quoteRevision-a.quoteRevision||b.updatedAt.localeCompare(a.updatedAt))[0]||null;
}

export async function createActualFromEstimate(requestId:string,quoteRevision:number){
  const items=await costSnapshotsForRequest(requestId);
  const existing=items.find(item=>item.quoteRevision===quoteRevision&&item.status!=="estimate");
  if(existing)return existing;
  const estimate=items.find(item=>item.quoteRevision===quoteRevision&&item.status==="estimate");
  if(!estimate)throw new Error('Cost estimate not found for this quote revision.');
  const now=new Date().toISOString();
  return saveCostSnapshot({...estimate,id:`${estimate.quoteId}:r${quoteRevision}:actual`,status:'actual',createdAt:now,updatedAt:now,finalizedAt:''});
}

export function finalizeActualCost(id:string){return mutate(async()=>{
  const items=await readCostSnapshots();const index=items.findIndex(item=>item.id===id);if(index<0)throw new Error('Actual cost snapshot not found.');if(items[index].status==='estimate')throw new Error('Only actual costing can be finalized.');const now=new Date().toISOString();items[index]={...items[index],status:'finalized',finalizedAt:now,updatedAt:now};await writeCollection(COLLECTION,items);return items[index];
});}

export function reopenActualCost(id:string){return mutate(async()=>{
  const items=await readCostSnapshots();const index=items.findIndex(item=>item.id===id);if(index<0)throw new Error('Actual cost snapshot not found.');if(items[index].status!=='finalized')throw new Error('Only finalized costing can be reopened.');items[index]={...items[index],status:'actual',finalizedAt:'',updatedAt:new Date().toISOString()};await writeCollection(COLLECTION,items);return items[index];
});}

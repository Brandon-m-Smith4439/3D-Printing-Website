import {proposePacking} from './slicing-proposals.ts';
import type {Order,Product} from '../commerce/store.ts';
import type {ProductProject} from './projects.ts';
import type {PackingPreset,SliceJob} from './slicing-types.ts';
export function packingForOrder(order:Pick<Order,'status'|'refundedCents'|'items'>,products:Product[],projects:ProductProject[],jobs:SliceJob[],config:{profileHashes:Record<string,string|null>;presets:PackingPreset[];massAllowanceGrams:number}){
 const items=order.items.filter(i=>!i.digital);if(order.status!=='paid'||order.refundedCents||items.length!==1)return null;
 const item=items[0],product=products.find(p=>p.id===item.id&&p.revisionId===item.revisionId),project=projects.find(p=>p.id===product?.projectId),job=jobs.find(j=>j.id===project?.sliceEstimate?.jobId);
 if(!product||!project||!job?.result||job.state!=='completed'||project.revisions.at(-1)?.id!==item.revisionId||job.input.revisionId!==item.revisionId||job.input.quantity!==item.quantity||project.sliceEstimate?.quantity!==item.quantity||JSON.stringify(project.materialPlan)!==JSON.stringify(job.input.materialPlan)||config.profileHashes[job.input.profileId]!==job.input.profileHash)return null;
 return proposePacking(job.result,item.quantity,config.presets,config.massAllowanceGrams,job.measuredPartMass?.grams);
}

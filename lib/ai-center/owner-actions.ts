import {roleNames,type Job} from './types.ts';
type AttentionJob=Pick<Job,'id'|'kind'|'status'|'boundCents'>;
import type {ProductProject} from './projects.ts';
import type {ReadinessCheck} from './readiness.ts';
import type {CatalogShipping} from '../commerce/shipping-types.ts';
export type OwnerAction={id:string;title:string;detail:string;target:string;group:'Approvals'|'Products'|'Shipping'|'Setup and problems';projectId?:string};
export type ShippingAttentionRow={order:{id:string;status:string;refundedCents:number};shipping:Pick<CatalogShipping,'state'|'email'|'reviewReason'>|null};
export function ownerActions(input:{jobs:AttentionJob[];approvals?:AttentionJob[];projects:ProductProject[];checks:ReadinessCheck[];rows:ShippingAttentionRow[]}):OwnerAction[]{
 const actions:OwnerAction[]=[];
 const add=(id:string,title:string,detail:string,target:string,group:OwnerAction['group'],projectId?:string)=>actions.push({id,title,detail,target,group,projectId});
 const approvals=input.approvals??[],pendingIds=new Set(approvals.map(j=>j.id));
 for(const j of [...approvals,...input.jobs.filter(j=>!pendingIds.has(j.id))]){
  if(j.status==='spend-review'||j.status==='review')add(j.id,j.status==='spend-review'?`Approve AI spending: ${roleNames[j.kind]}`:`Review the ${roleNames[j.kind]} draft`,j.status==='spend-review'?`Review one call up to $${(j.boundCents/100).toFixed(2)}. Approval does not publish anything.`:'Read the full draft before approving or rejecting it.',`approval-${j.id}`,'Approvals');
  if(j.status==='failed')add(j.id,`Check failed ${roleNames[j.kind]} task`,'Review the failure. Do not repeat uncertain spending automatically.',`task-${j.id}`,'Setup and problems');
 }
 for(const p of input.projects){
  const last=p.revisions.at(-1),passed=last?.tests.at(-1)?.passed&&!p.printTestNeedsReview;
  if(last&&!passed)add(`test-${p.id}`,`Test the current print: ${p.name}`,'Record the result for the latest file and actual material. Earlier revision tests do not clear this step.','product-workspaces','Products',p.id);
  else if(!p.release)add(`project-${p.id}`,`${p.name}: ${p.stage==='research'?'review demand evidence':p.stage==='refine'?'refine the model':passed?'prepare the sale package':'review the design'}`,'Open the project to review evidence, files and the next step. A finished model alone is not a released product.','product-workspaces','Products',p.id);
  if(last&&(!p.sales||p.salesNeedsReview))add(`cost-${p.id}`,`Review costs and price: ${p.name}`,'Confirm material, printing, packing, fees and your profit floor before approving a price.','product-workspaces','Products',p.id);
 }
 for(const {order:o,shipping:s} of input.rows){
  const problem=s?.reviewReason||s?.state==='buying'||s?.state==='reconcile';
  if(problem){add(`shipping-${o.id}`,`Resolve shipping: ${o.id.slice(0,8)}`,'Check the original shipment and review the warning before any purchase or handoff.',`shipping-${o.id}`,'Shipping');continue;}
  if(o.status!=='paid'||o.refundedCents)continue;
  const title=!s?'Confirm the packed weight and box':s.state==='packed'?'Review carrier rates':s.state==='rated'?'Approve one exact postage rate':s.state==='label-ready'?'Print label and confirm carrier handoff':s.email.state!=='sent'?'Check owner label email':null;
  if(title)add(`shipping-${o.id}`,`${title}: ${o.id.slice(0,8)}`,'Open the order. TEST labels are not valid postage; purchases retain individual approval.',`shipping-${o.id}`,'Shipping');
 }
 for(const c of input.checks)if(c.status!=='ready')add(`setup-${c.id}`,`${c.status==='off'?'Disabled — review':'Complete setup'}: ${c.label}`,c.detail,c.id==='live-carrier'?'catalog-shipping-heading':'launch-setup','Setup and problems');
 return actions;
}

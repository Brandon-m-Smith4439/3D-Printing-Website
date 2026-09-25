import assert from 'node:assert/strict';
import { buildProfitabilityReport } from '../lib/profitability-report.ts';
const now=new Date('2026-09-25T12:00:00.000Z');
const requests=[
{id:'r1',requestCode:'R1',status:'quoted',updatedAt:'2026-09-24T12:00:00.000Z',createdAt:'2026-09-20T00:00:00.000Z'},
{id:'r2',requestCode:'R2',status:'completed',updatedAt:'2026-09-23T12:00:00.000Z',createdAt:'2026-09-01T00:00:00.000Z'},
{id:'r3',requestCode:'R3',status:'completed',updatedAt:'2026-09-22T12:00:00.000Z',createdAt:'2026-09-01T00:00:00.000Z'},
{id:'r4',requestCode:'R4',status:'completed',updatedAt:'2026-05-01T12:00:00.000Z',createdAt:'2026-04-01T00:00:00.000Z'},
];
const quotes=[
{id:'q1',requestId:'r1',revision:1,status:'sent',totalCents:10000,updatedAt:'2026-09-24T00:00:00.000Z'},
{id:'q2',requestId:'r2',revision:1,status:'deposit-paid',totalCents:12000,updatedAt:'2026-09-20T00:00:00.000Z'},
{id:'q3',requestId:'r3',revision:1,status:'deposit-paid',totalCents:8000,updatedAt:'2026-09-20T00:00:00.000Z'},
{id:'q4',requestId:'r4',revision:1,status:'deposit-paid',totalCents:9000,updatedAt:'2026-04-20T00:00:00.000Z'},
];
const snapshot=(id,requestId,quoteId,status,revenue,direct,margin,target=4000)=>({id,requestId,requestCode:requestId,quoteId,quoteRevision:1,status,materialLines:[],machineHours:0,machineHourlyCostCents:0,designHours:0,designHourlyCostCents:0,laborHours:0,laborHourlyCostCents:0,postProcessingHours:0,postProcessingHourlyCostCents:0,packagingCostCents:0,localDeliveryInternalCostCents:0,miscellaneousCostCents:0,paymentFeeCents:0,shippingInternalCostCents:0,nonPaymentDirectCostCents:direct,directCostCents:direct,quotedRevenueCents:revenue,contributionProfitCents:revenue-direct,contributionMarginBasisPoints:margin,targetMarginBasisPoints:target,suggestedPriceCents:0,priceMeetsTarget:margin>=target,costingSourceSummary:'',createdAt:'2026-09-20',updatedAt:'2026-09-24',finalizedAt:status==='finalized'?'2026-09-23':''});
const snapshots=[
snapshot('q1:r1:estimate','r1','q1','estimate',10000,6000,4000,4500),
snapshot('q2:r1:estimate','r2','q2','estimate',12000,7000,4167),
snapshot('q2:r1:actual','r2','q2','finalized',12000,8000,3333),
snapshot('q4:r1:actual','r4','q4','finalized',9000,4000,5556),
];
const report=buildProfitabilityReport({requests,quotes,snapshots,now,range:'30d'});
assert.equal(report.active.revenueCents,10000);
assert.equal(report.active.directCostCents,6000);
assert.equal(report.active.contributionProfitCents,4000);
assert.equal(report.active.belowTargetCount,1);
assert.equal(report.completed.revenueCents,12000);
assert.equal(report.completed.directCostCents,8000);
assert.equal(report.completed.contributionProfitCents,4000);
assert.equal(report.completed.completedCount,2);
assert.equal(report.completed.uncostedCount,1);
assert.equal(report.completed.averageProfitCents,4000);
assert.equal(report.completed.contributionMarginBasisPoints,3333);
const all=buildProfitabilityReport({requests,quotes,snapshots,now,range:'all'});
assert.equal(all.completed.revenueCents,21000);
assert.equal(all.completed.directCostCents,12000);
assert.equal(all.completed.contributionProfitCents,9000);
assert.equal(all.completed.completedCount,3);
assert.equal(all.completed.uncostedCount,1);
console.log('Profitability report checks passed.');

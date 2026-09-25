import assert from 'node:assert/strict';
import { buildOwnerProfitabilityOperations } from '../lib/owner-profitability-operations.ts';

const now = new Date('2026-09-25T14:00:00.000Z');
const requests = [
  { id:'req-1', requestCode:'REQ-ONE', status:'quoted', createdAt:'2026-09-20T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z' },
  { id:'req-2', requestCode:'REQ-TWO', status:'completed', createdAt:'2026-09-10T12:00:00.000Z', updatedAt:'2026-09-24T12:00:00.000Z' },
];
const quotes = [
  { id:'q-1', requestId:'req-1', requestCode:'REQ-ONE', revision:1, status:'sent', totalCents:10000, sentAt:'2026-09-25T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z' },
  { id:'q-2', requestId:'req-2', requestCode:'REQ-TWO', revision:1, status:'deposit-paid', totalCents:12000, sentAt:'2026-09-20T12:00:00.000Z', updatedAt:'2026-09-20T12:00:00.000Z' },
];
const estimate = {
  id:'q-1:r1:estimate', requestId:'req-1', requestCode:'REQ-ONE', quoteId:'q-1', quoteRevision:1, status:'estimate',
  materialLines:[], machineHours:0, machineHourlyCostCents:0, designHours:0, designHourlyCostCents:0, laborHours:0, laborHourlyCostCents:0,
  postProcessingHours:0, postProcessingHourlyCostCents:0, packagingCostCents:0, localDeliveryInternalCostCents:0, miscellaneousCostCents:0,
  paymentFeeCents:0, shippingInternalCostCents:0, nonPaymentDirectCostCents:7000, directCostCents:7000, quotedRevenueCents:10000,
  contributionProfitCents:3000, contributionMarginBasisPoints:3000, targetMarginBasisPoints:4000, suggestedPriceCents:11667, priceMeetsTarget:false,
  costingSourceSummary:'Bambu MSRP', createdAt:'2026-09-25T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z', finalizedAt:''
};
const actual = {
  ...estimate, id:'q-2:r1:actual', requestId:'req-2', requestCode:'REQ-TWO', quoteId:'q-2', status:'finalized', quotedRevenueCents:12000,
  directCostCents:8000, nonPaymentDirectCostCents:8000, contributionProfitCents:4000, contributionMarginBasisPoints:3333,
  targetMarginBasisPoints:0, priceMeetsTarget:true, finalizedAt:'2026-09-24T12:00:00.000Z', updatedAt:'2026-09-24T12:00:00.000Z'
};

const result = buildOwnerProfitabilityOperations({ requests, quotes, snapshots:[estimate, actual], now });
assert.equal(result.report.range, '30d');
assert.equal(result.report.active.contributionProfitCents, 3000);
assert.equal(result.report.active.contributionMarginBasisPoints, 3000);
assert.equal(result.report.completed.contributionProfitCents, 4000);
assert.equal(result.attention.length, 1);
assert.equal(result.attention[0].category, 'profitability');
assert.match(result.attention[0].title, /below target/i);

console.log('Owner profitability Operations Center checks passed.');

import assert from 'node:assert/strict';
import { buildProfitabilityAttention } from '../lib/owner-profitability-attention.ts';

const now = new Date('2026-09-25T14:00:00.000Z');
const baseRequest = { id:'req-1', requestCode:'REQ-ONE', status:'quoted', createdAt:'2026-09-20T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z' };
const quote = { id:'q-1', requestId:'req-1', requestCode:'REQ-ONE', revision:1, status:'sent', totalCents:10000, sentAt:'2026-09-25T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z' };

let items = buildProfitabilityAttention({ requests:[baseRequest], quotes:[quote], snapshots:[], now });
assert.equal(items.length,1);
assert.equal(items[0].category,'profitability');
assert.equal(items[0].severity,'watch');
assert.match(items[0].title,/missing costing/i);

const belowTarget = {
  id:'q-1:r1:estimate', requestId:'req-1', requestCode:'REQ-ONE', quoteId:'q-1', quoteRevision:1, status:'estimate',
  materialLines:[], machineHours:0, machineHourlyCostCents:0, designHours:0, designHourlyCostCents:0, laborHours:0, laborHourlyCostCents:0,
  postProcessingHours:0, postProcessingHourlyCostCents:0, packagingCostCents:0, localDeliveryInternalCostCents:0, miscellaneousCostCents:0,
  paymentFeeCents:0, shippingInternalCostCents:0, nonPaymentDirectCostCents:7000, directCostCents:7000, quotedRevenueCents:10000,
  contributionProfitCents:3000, contributionMarginBasisPoints:3000, targetMarginBasisPoints:4000, suggestedPriceCents:11667, priceMeetsTarget:false,
  costingSourceSummary:'Bambu MSRP', createdAt:'2026-09-25T12:00:00.000Z', updatedAt:'2026-09-25T12:00:00.000Z', finalizedAt:''
};
items = buildProfitabilityAttention({ requests:[baseRequest], quotes:[quote], snapshots:[belowTarget], now });
assert.equal(items.length,1);
assert.match(items[0].title,/below target/i);
assert.equal(items[0].severity,'watch');

const completed = { ...baseRequest, status:'completed', updatedAt:'2026-09-25T13:00:00.000Z' };
items = buildProfitabilityAttention({ requests:[completed], quotes:[quote], snapshots:[belowTarget], now });
assert.equal(items.length,1);
assert.match(items[0].title,/not finalized/i);
assert.equal(items[0].severity,'watch');

const finalized = { ...belowTarget, id:'q-1:r1:actual', status:'finalized', finalizedAt:'2026-09-25T13:30:00.000Z' };
items = buildProfitabilityAttention({ requests:[completed], quotes:[quote], snapshots:[belowTarget, finalized], now });
assert.equal(items.length,0);

console.log('Owner profitability attention checks passed.');

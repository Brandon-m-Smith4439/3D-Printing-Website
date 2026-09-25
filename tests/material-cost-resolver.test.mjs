import assert from 'node:assert/strict';
import {
  resolveMaterialCost,
  weightedActualCostPerGram,
} from '../lib/material-cost-resolver.ts';

const base=(overrides={})=>({
  id:'pla-basic-refill',manufacturer:'Bambu Lab',familyKey:'pla-basic',displayName:'PLA Basic — Refill',materialClass:'PLA',packageType:'refill',
  netWeightGrams:1000,msrpCents:1999,msrpCostPerGramMicros:1999000,manualFallbackCostPerGramMicros:0,active:true,
  sourceUrl:'https://example.test',sourceLabel:'Bambu Lab US official store',lastVerifiedAt:'2026-09-25T00:00:00.000Z',notes:'',createdAt:'',updatedAt:'',...overrides,
});
const lot=(overrides={})=>({
  id:crypto.randomUUID(),invoiceImportId:'imp-1',vendor:'Bambu Lab',orderNumber:'B-1',orderDate:'2026-09-20',catalogItemId:'pla-basic-refill',productNameRaw:'PLA Basic Refill',skuRaw:'',colorName:'Black',colorCode:'',packageType:'refill',netWeightGramsPerUnit:1000,quantity:1,unitListPriceCents:1999,directLineDiscountCents:0,allocatedOrderDiscountCents:0,allocatedShippingCents:0,allocatedTaxCents:0,landedLineCostCents:1499,landedUnitCostCents:1499,landedCostPerGramMicros:1499000,currency:'usd',createdAt:'2026-09-20T00:00:00.000Z',...overrides,
});

const lots=[
  lot({id:'l1',quantity:4,landedLineCostCents:5996,landedUnitCostCents:1499,landedCostPerGramMicros:1499000}),
  lot({id:'l2',invoiceImportId:'imp-2',quantity:2,landedLineCostCents:3198,landedUnitCostCents:1599,landedCostPerGramMicros:1599000,createdAt:'2026-09-22T00:00:00.000Z'}),
];
const avg=weightedActualCostPerGram('pla-basic-refill',lots);
assert.equal(avg.totalGrams,6000);
assert.equal(avg.totalCostCents,9194);
assert.equal(avg.costPerGramMicros,Math.round(9194*1_000_000/6000));
assert.equal(avg.latestPurchaseCostPerGramMicros,1599000);

const actual=resolveMaterialCost(base(),lots);
assert.equal(actual.source,'actual-average');
assert.equal(actual.averageActualCostPerGramMicros,avg.costPerGramMicros);
assert.ok(actual.savingsVsMsrpBasisPoints>0);

const msrp=resolveMaterialCost(base(),[]);
assert.equal(msrp.source,'bambu-msrp');
assert.equal(msrp.costPerGramMicros,1999000);

const manual=resolveMaterialCost(base({msrpCents:0,msrpCostPerGramMicros:0,manualFallbackCostPerGramMicros:2250000}),[]);
assert.equal(manual.source,'manual-fallback');
assert.equal(manual.costPerGramMicros,2250000);

const none=resolveMaterialCost(base({msrpCents:0,msrpCostPerGramMicros:0,manualFallbackCostPerGramMicros:0}),[]);
assert.equal(none.source,'unpriced');
assert.equal(none.costPerGramMicros,0);

const halfKg=[lot({catalogItemId:'pva',packageType:'with-spool',netWeightGramsPerUnit:500,quantity:2,landedLineCostCents:6000,landedUnitCostCents:3000,landedCostPerGramMicros:6000000})];
const half=weightedActualCostPerGram('pva',halfKg);
assert.equal(half.totalGrams,1000);
assert.equal(half.costPerGramMicros,6000000);

const other=weightedActualCostPerGram('pla-basic-spool',lots);
assert.equal(other.totalGrams,0);
assert.equal(other.costPerGramMicros,0);

console.log('Material cost resolver checks passed.');

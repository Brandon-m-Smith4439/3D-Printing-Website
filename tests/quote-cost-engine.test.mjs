import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { quoteCostInputFromSnapshot, quoteCostingIsComplete, resolveQuoteCostSnapshot } from '../lib/quote-cost-engine.ts';

const settings={targetContributionMarginBasisPoints:4000,defaultMachineHourlyCostCents:300,defaultDesignHourlyCostCents:1000,defaultLaborHourlyCostCents:2000,defaultPostProcessingHourlyCostCents:1600,defaultPackagingCostCents:100,defaultPaymentFeePercentBasisPoints:290,defaultPaymentFeeFixedCents:30,includeInvoiceTaxInMaterialCost:true,includeInvoiceShippingInMaterialCost:true,actualMaterialCostMethod:'weighted-average',updatedAt:''};
const catalog=[
  {id:'pla-basic-refill',manufacturer:'Bambu Lab',familyKey:'pla-basic',displayName:'PLA Basic — Refill',materialClass:'PLA',packageType:'refill',netWeightGrams:1000,msrpCents:1999,msrpCostPerGramMicros:1999000,manualFallbackCostPerGramMicros:0,active:true,sourceUrl:'https://example.test',sourceLabel:'Bambu',lastVerifiedAt:'2026-09-25',notes:'',createdAt:'',updatedAt:''},
  {id:'pva',manufacturer:'Bambu Lab',familyKey:'pva',displayName:'PVA',materialClass:'PVA',packageType:'with-spool',netWeightGrams:500,msrpCents:3999,msrpCostPerGramMicros:7998000,manualFallbackCostPerGramMicros:0,active:true,sourceUrl:'https://example.test',sourceLabel:'Bambu',lastVerifiedAt:'2026-09-25',notes:'',createdAt:'',updatedAt:''},
];
const lots=[{id:'lot-1',invoiceImportId:'imp-1',vendor:'Bambu Lab',orderNumber:'B-1',orderDate:'2026-09-20',catalogItemId:'pla-basic-refill',productNameRaw:'PLA Basic',skuRaw:'',colorName:'Black',colorCode:'',packageType:'refill',netWeightGramsPerUnit:1000,quantity:4,unitListPriceCents:1999,directLineDiscountCents:0,allocatedOrderDiscountCents:2000,allocatedShippingCents:0,allocatedTaxCents:0,landedLineCostCents:6000,landedUnitCostCents:1500,landedCostPerGramMicros:1500000,currency:'usd',createdAt:'2026-09-20T00:00:00.000Z'}];
const quote=(revision=1)=>({id:'quote-1',requestId:'req-1',requestCode:'REQ-ONE',customerAccountId:'cus-1',revision,status:'sent',basePriceCents:9200,assemblyMode:'not-required',assemblyFeeCents:0,rushFeeCents:0,fulfillmentMode:'shipping',localDeliveryFeeCents:0,packageWeightOz:32,packageLengthIn:10,packageWidthIn:8,packageHeightIn:6,shippingSelection:{shipmentId:'shp-proposed',rateId:'rate-1',carrier:'UPS',service:'Ground',rateCents:800,deliveryDays:3,deliveryDate:'',address:{name:'Customer',street1:'1 Main',street2:'',city:'Town',state:'NC',zip:'28112',country:'US'},selectedAt:'2026-09-25T00:00:00.000Z'},totalCents:10000,depositCents:5000,balanceCents:5000,currency:'usd',material:'PLA',dimensions:'6in',estimatedReadyDate:'',notes:'',terms:'terms terms terms terms terms',createdAt:'',updatedAt:'',sentAt:'',approvedAt:'',approvedByCustomerId:'',approvalSnapshot:null,stripeCheckoutSessionId:'',stripeCheckoutAmountCents:0,depositPaidAt:'',paymentProvider:'',payments:[],refunds:[],history:[]});
const costing={materialLines:[{id:'m1',catalogItemId:'pla-basic-refill',grams:100},{id:'m2',catalogItemId:'pva',grams:50}],machineHours:2,designHours:1,laborHours:.5,postProcessingHours:.25,packagingCostCents:100,localDeliveryInternalCostCents:0,miscellaneousCostCents:50};

const estimate=resolveQuoteCostSnapshot({quote:quote(),costing,settings,catalog,lots,shipment:null,now:'2026-09-25T12:00:00.000Z',status:'estimate'});
assert.equal(estimate.materialLines[0].costSource,'actual-average');
assert.equal(estimate.materialLines[0].extendedCostCents,150);
assert.equal(estimate.materialLines[1].costSource,'bambu-msrp');
assert.equal(estimate.materialLines[1].extendedCostCents,400);
assert.equal(estimate.shippingInternalCostCents,800);
assert.equal(estimate.nonPaymentDirectCostCents,4500);
assert.equal(estimate.quotedRevenueCents,10000);
assert.equal(estimate.paymentFeeCents,320);
assert.equal(estimate.directCostCents,4820);
assert.equal(estimate.contributionProfitCents,5180);
assert.equal(estimate.contributionMarginBasisPoints,5180);
assert.ok(estimate.suggestedPriceCents>0);
assert.equal(estimate.id,'quote-1:r1:estimate');
assert.deepEqual(quoteCostInputFromSnapshot(estimate),costing);
assert.equal(quoteCostingIsComplete(estimate),true);
const incomplete=resolveQuoteCostSnapshot({quote:quote(),costing:{...costing,materialLines:[{id:'missing',catalogItemId:'missing-material',grams:50}]},settings,catalog,lots,shipment:null,now:'2026-09-25T12:30:00.000Z',status:'estimate'});
assert.equal(incomplete.materialLines[0].costSource,'unpriced');
assert.equal(quoteCostingIsComplete(incomplete),false);

const purchased={id:'ship-1',requestId:'req-1',quoteId:'quote-1',requestCode:'REQ-ONE',easyPostShipmentId:'shp-1',easyPostRateId:'rate-1',trackerId:'',carrier:'UPS',service:'Ground',customerRateCents:800,postageCostCents:650,rateDifferenceCents:-150,trackingCode:'',publicTrackingUrl:'',labelUrl:'',labelPdfUrl:'',labelPngUrl:'',status:'label_created',statusDetail:'',estimatedDeliveryDate:'',reviewReason:'',proposedShipmentId:'',proposedRateId:'',proposedRateCents:0,refundStatus:'',purchasedAt:'2026-09-25T10:00:00.000Z',deliveredAt:'',refundedAt:'',createdAt:'',updatedAt:'',lastWebhookEventId:'',trackingEvents:[]};
const actual=resolveQuoteCostSnapshot({quote:quote(),costing,settings,catalog,lots,shipment:purchased,now:'2026-09-25T12:00:00.000Z',status:'actual'});
assert.equal(actual.shippingInternalCostCents,650);
assert.equal(actual.id,'quote-1:r1:actual');
const refunded=resolveQuoteCostSnapshot({quote:quote(),costing,settings,catalog,lots,shipment:{...purchased,status:'refunded',refundStatus:'refunded',refundedAt:'2026-09-25T11:00:00.000Z'},now:'2026-09-25T12:00:00.000Z',status:'actual'});
assert.equal(refunded.shippingInternalCostCents,0);

const db=`/tmp/meshharbor-quote-cost-${process.pid}.sqlite`;
process.env.DATABASE_PATH=db;
await rm(db,{force:true});
const store=await import('../lib/quote-cost-store.ts');
await store.saveCostSnapshot(estimate);
const revision2=resolveQuoteCostSnapshot({quote:quote(2),costing:{...costing,machineHours:3},settings,catalog,lots,shipment:null,now:'2026-09-25T13:00:00.000Z',status:'estimate'});
await store.saveCostSnapshot(revision2);
const rows=await store.costSnapshotsForRequest('req-1');
assert.equal(rows.length,2);
assert.equal(rows.find(x=>x.quoteRevision===1).machineHours,2);
assert.equal(rows.find(x=>x.quoteRevision===2).machineHours,3);
await rm(db,{force:true});
console.log('Quote cost engine checks passed.');

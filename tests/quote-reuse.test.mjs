import assert from 'node:assert/strict';
import { buildReusableQuoteTemplate, sanitizePricingPreset } from '../lib/quote-reuse.ts';

const sourceQuote={id:'quote-1',requestId:'req-old',requestCode:'REQ-OLD',customerAccountId:'customer-secret',revision:3,status:'deposit-paid',basePriceCents:8000,assemblyMode:'assembled',assemblyFeeCents:1200,rushFeeCents:500,fulfillmentMode:'shipping',localDeliveryFeeCents:0,packageWeightOz:32,packageLengthIn:10,packageWidthIn:8,packageHeightIn:6,shippingSelection:{shipmentId:'shp-secret',rateId:'rate-secret',carrier:'UPS',service:'Ground',rateCents:900,address:{name:'Private Customer',street1:'1 Secret St',street2:'',city:'Town',state:'NC',zip:'28112',country:'US'},selectedAt:'2026-09-20'},totalCents:10600,depositCents:5300,balanceCents:5300,currency:'usd',material:'PLA',dimensions:'6x6',estimatedReadyDate:'2026-10-01',notes:'Customer-specific private note',terms:'terms',createdAt:'2026-09-01',updatedAt:'2026-09-20',sentAt:'2026-09-02',approvedAt:'2026-09-03',approvedByCustomerId:'customer-secret',approvalSnapshot:null,stripeCheckoutSessionId:'cs_secret',stripeCheckoutAmountCents:5300,depositPaidAt:'2026-09-04',paymentProvider:'stripe',payments:[{id:'pay',paymentIntentId:'pi_secret'}],refunds:[],history:[]};
const sourceCost={id:'cost',requestId:'req-old',requestCode:'REQ-OLD',quoteId:'quote-1',quoteRevision:3,status:'estimate',materialLines:[{id:'m1',catalogItemId:'pla-basic-refill',grams:220,displayName:'PLA Basic — Refill',costSource:'actual-average',costPerGramMicros:1500000,extendedCostCents:330}],machineHours:5,designHours:1,laborHours:.5,postProcessingHours:.25,packagingCostCents:100,localDeliveryInternalCostCents:0,miscellaneousCostCents:75,paymentFeeCents:0,shippingInternalCostCents:0,nonPaymentDirectCostCents:0,directCostCents:0,quotedRevenueCents:0,contributionProfitCents:0,contributionMarginBasisPoints:0,targetMarginBasisPoints:0,suggestedPriceCents:0,priceMeetsTarget:true,costingSourceSummary:'',machineHourlyCostCents:0,designHourlyCostCents:0,laborHourlyCostCents:0,postProcessingHourlyCostCents:0,createdAt:'',updatedAt:'',finalizedAt:''};
const reusable=buildReusableQuoteTemplate(sourceQuote,sourceCost);
assert.equal(reusable.quoteDefaults.basePriceCents,8000);
assert.equal(reusable.quoteDefaults.assemblyMode,'assembled');
assert.equal(reusable.quoteDefaults.fulfillmentMode,'shipping');
assert.equal(reusable.costing.materialLines[0].catalogItemId,'pla-basic-refill');
assert.equal(reusable.costing.materialLines[0].grams,220);
assert.equal(reusable.costing.machineHours,5);
const serialized=JSON.stringify(reusable);
for(const secret of ['customer-secret','shp-secret','rate-secret','Private Customer','1 Secret St','cs_secret','pi_secret','Customer-specific private note','2026-10-01'])assert.equal(serialized.includes(secret),false,`leaked ${secret}`);

const preset=sanitizePricingPreset({id:'preset-secret',name:'  Display Piece  ',description:' Common setup ',projectType:'display',customerAccountId:'should-drop',quoteDefaults:{material:'PLA',dimensions:'6x6',assemblyMode:'assembled',assemblyFeeCents:1200,rushFeeCents:0,fulfillmentMode:'pickup',localDeliveryFeeCents:0,basePriceCents:8000,shippingAddress:'drop'},costing:{materialLines:[{id:'m1',catalogItemId:'pla-basic-refill',grams:200,private:'drop'}],machineHours:4,designHours:1,laborHours:0.5,postProcessingHours:0.25,packagingCostCents:100,localDeliveryInternalCostCents:0,miscellaneousCostCents:50},createdAt:'old',updatedAt:'old'});
assert.equal(preset.name,'Display Piece');
assert.equal('customerAccountId' in preset,false);
assert.equal('shippingAddress' in preset.quoteDefaults,false);
assert.equal('private' in preset.costing.materialLines[0],false);
console.log('Quote reuse sanitization checks passed.');

import type { PricingPreset, QuoteCostInput, QuoteCostSnapshot } from './pricing-types.ts';
import type { StoredQuote } from './quote-types.ts';

function number(value:unknown,min=0,max=1_000_000){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;}
function cleanCosting(raw:any):QuoteCostInput{
  const lines=Array.isArray(raw?.materialLines)?raw.materialLines.slice(0,20).map((line:any,index:number)=>({id:String(line?.id||`material-${index+1}`).slice(0,80),catalogItemId:String(line?.catalogItemId||'').slice(0,120),grams:number(line?.grams,0,1_000_000)})):[];
  return {materialLines:lines,machineHours:number(raw?.machineHours,0,10_000),designHours:number(raw?.designHours,0,10_000),laborHours:number(raw?.laborHours,0,10_000),postProcessingHours:number(raw?.postProcessingHours,0,10_000),packagingCostCents:Math.round(number(raw?.packagingCostCents)),localDeliveryInternalCostCents:Math.round(number(raw?.localDeliveryInternalCostCents)),miscellaneousCostCents:Math.round(number(raw?.miscellaneousCostCents))};
}

export function buildReusableQuoteTemplate(sourceQuote:StoredQuote,sourceCost:QuoteCostSnapshot|null){
  return {
    quoteDefaults:{material:sourceQuote.material,dimensions:sourceQuote.dimensions,assemblyMode:sourceQuote.assemblyMode,assemblyFeeCents:sourceQuote.assemblyFeeCents,rushFeeCents:sourceQuote.rushFeeCents,fulfillmentMode:sourceQuote.fulfillmentMode,localDeliveryFeeCents:sourceQuote.localDeliveryFeeCents,basePriceCents:sourceQuote.basePriceCents},
    costing:cleanCosting(sourceCost?{materialLines:sourceCost.materialLines.map(line=>({id:line.id,catalogItemId:line.catalogItemId,grams:line.grams})),machineHours:sourceCost.machineHours,designHours:sourceCost.designHours,laborHours:sourceCost.laborHours,postProcessingHours:sourceCost.postProcessingHours,packagingCostCents:sourceCost.packagingCostCents,localDeliveryInternalCostCents:sourceCost.localDeliveryInternalCostCents,miscellaneousCostCents:sourceCost.miscellaneousCostCents}:{}),
  };
}

export function sanitizePricingPreset(input:any):PricingPreset{
  const q=input?.quoteDefaults||{};
  const assemblyMode=['assembled','disassembled','not-required'].includes(q.assemblyMode)?q.assemblyMode:'not-required';
  const fulfillmentMode=['pickup','shipping','local-delivery'].includes(q.fulfillmentMode)?q.fulfillmentMode:'pickup';
  return {
    id:String(input?.id||'').trim().slice(0,120),
    name:String(input?.name||'').trim().slice(0,80),
    description:String(input?.description||'').trim().slice(0,300),
    projectType:String(input?.projectType||'').trim().slice(0,80),
    quoteDefaults:{material:String(q.material||'').trim().slice(0,120),dimensions:String(q.dimensions||'').trim().slice(0,200),assemblyMode,assemblyFeeCents:Math.round(number(q.assemblyFeeCents)),rushFeeCents:Math.round(number(q.rushFeeCents)),fulfillmentMode,localDeliveryFeeCents:Math.round(number(q.localDeliveryFeeCents)),basePriceCents:Math.round(number(q.basePriceCents))},
    costing:cleanCosting(input?.costing),
    createdAt:String(input?.createdAt||''),
    updatedAt:String(input?.updatedAt||''),
  };
}

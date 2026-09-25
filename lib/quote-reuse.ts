import type { PricingPreset, QuoteCostInput, QuoteCostSnapshot } from './pricing-types.ts';
import type { StoredQuote } from './quote-types.ts';

function number(value:unknown,min=0,max=1_000_000){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function cleanCosting(raw:unknown):QuoteCostInput{
  const source=record(raw);
  const lines=Array.isArray(source.materialLines)?source.materialLines.slice(0,20).map((lineValue,index)=>{const line=record(lineValue);return{id:String(line.id||`material-${index+1}`).slice(0,80),catalogItemId:String(line.catalogItemId||'').slice(0,120),grams:number(line.grams,0,1_000_000)};}):[];
  return {materialLines:lines,machineHours:number(source.machineHours,0,10_000),designHours:number(source.designHours,0,10_000),laborHours:number(source.laborHours,0,10_000),postProcessingHours:number(source.postProcessingHours,0,10_000),packagingCostCents:Math.round(number(source.packagingCostCents)),localDeliveryInternalCostCents:Math.round(number(source.localDeliveryInternalCostCents)),miscellaneousCostCents:Math.round(number(source.miscellaneousCostCents))};
}

export function buildReusableQuoteTemplate(sourceQuote:StoredQuote,sourceCost:QuoteCostSnapshot|null){
  return {
    quoteDefaults:{material:sourceQuote.material,dimensions:sourceQuote.dimensions,assemblyMode:sourceQuote.assemblyMode,assemblyFeeCents:sourceQuote.assemblyFeeCents,rushFeeCents:sourceQuote.rushFeeCents,fulfillmentMode:sourceQuote.fulfillmentMode,localDeliveryFeeCents:sourceQuote.localDeliveryFeeCents,basePriceCents:sourceQuote.basePriceCents},
    costing:cleanCosting(sourceCost?{materialLines:sourceCost.materialLines.map(line=>({id:line.id,catalogItemId:line.catalogItemId,grams:line.grams})),machineHours:sourceCost.machineHours,designHours:sourceCost.designHours,laborHours:sourceCost.laborHours,postProcessingHours:sourceCost.postProcessingHours,packagingCostCents:sourceCost.packagingCostCents,localDeliveryInternalCostCents:sourceCost.localDeliveryInternalCostCents,miscellaneousCostCents:sourceCost.miscellaneousCostCents}:{}),
  };
}

export function sanitizePricingPreset(input:unknown):PricingPreset{
  const source=record(input),q=record(source.quoteDefaults);
  const assemblyMode=q.assemblyMode==='assembled'||q.assemblyMode==='disassembled'||q.assemblyMode==='not-required'?q.assemblyMode:'not-required';
  const fulfillmentMode=q.fulfillmentMode==='pickup'||q.fulfillmentMode==='shipping'||q.fulfillmentMode==='local-delivery'?q.fulfillmentMode:'pickup';
  return {
    id:String(source.id||'').trim().slice(0,120),
    name:String(source.name||'').trim().slice(0,80),
    description:String(source.description||'').trim().slice(0,300),
    projectType:String(source.projectType||'').trim().slice(0,80),
    quoteDefaults:{material:String(q.material||'').trim().slice(0,120),dimensions:String(q.dimensions||'').trim().slice(0,200),assemblyMode,assemblyFeeCents:Math.round(number(q.assemblyFeeCents)),rushFeeCents:Math.round(number(q.rushFeeCents)),fulfillmentMode,localDeliveryFeeCents:Math.round(number(q.localDeliveryFeeCents)),basePriceCents:Math.round(number(q.basePriceCents))},
    costing:cleanCosting(source.costing),
    createdAt:String(source.createdAt||''),
    updatedAt:String(source.updatedAt||''),
  };
}

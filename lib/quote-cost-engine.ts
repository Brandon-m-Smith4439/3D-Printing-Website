import type { StoredQuote } from './quote-types.ts';
import type { ShipmentRecord } from './shipment-types.ts';
import type { BambuFilamentCatalogItem, FilamentPurchaseLot, PricingSettings, QuoteCostInput, QuoteCostSnapshot } from './pricing-types.ts';
import { contributionMetrics, materialCostCents, suggestedRevenueCents } from './pricing-math.ts';
import { resolveMaterialCost } from './material-cost-resolver.ts';

export function quoteEstimateId(quoteId:string,revision:number){return `${quoteId}:r${revision}:estimate`;}
export function quoteActualId(quoteId:string,revision:number){return `${quoteId}:r${revision}:actual`;}

export function quoteCostingIsComplete(snapshot:QuoteCostSnapshot){return !snapshot.materialLines.some(line=>line.grams>0&&line.costSource==='unpriced');}

function hoursCost(hours:number,hourlyCents:number){
  if(!Number.isFinite(hours)||hours<=0||!Number.isFinite(hourlyCents)||hourlyCents<=0)return 0;
  return Math.round(hours*hourlyCents);
}

function shippingInternalCost(quote:StoredQuote,shipment:ShipmentRecord|null){
  if(quote.fulfillmentMode!=="shipping")return 0;
  if(shipment&&(shipment.refundStatus==="refunded"||shipment.status==="refunded"))return 0;
  if(shipment?.purchasedAt&&shipment.postageCostCents>0)return shipment.postageCostCents;
  return Math.max(0,quote.shippingSelection?.rateCents||0);
}

export function resolveQuoteCostSnapshot(input:{
  quote:StoredQuote;
  costing:QuoteCostInput;
  settings:PricingSettings;
  catalog:BambuFilamentCatalogItem[];
  lots:FilamentPurchaseLot[];
  shipment:ShipmentRecord|null;
  now:string;
  status:"estimate"|"actual"|"finalized";
}):QuoteCostSnapshot{
  const catalogById=new Map(input.catalog.map(item=>[item.id,item]));
  const materialLines=input.costing.materialLines.map(line=>{
    const catalogItem=catalogById.get(line.catalogItemId);
    if(!catalogItem){
      return {...line,displayName:"Unknown Bambu material",costSource:"unpriced" as const,costPerGramMicros:0,extendedCostCents:0};
    }
    const resolved=resolveMaterialCost(catalogItem,input.lots);
    return {...line,displayName:catalogItem.displayName,costSource:resolved.source,costPerGramMicros:resolved.costPerGramMicros,extendedCostCents:materialCostCents(line.grams,resolved.costPerGramMicros)};
  });
  const materialTotal=materialLines.reduce((sum,line)=>sum+line.extendedCostCents,0);
  const machineCost=hoursCost(input.costing.machineHours,input.settings.defaultMachineHourlyCostCents);
  const designCost=hoursCost(input.costing.designHours,input.settings.defaultDesignHourlyCostCents);
  const laborCost=hoursCost(input.costing.laborHours,input.settings.defaultLaborHourlyCostCents);
  const postProcessingCost=hoursCost(input.costing.postProcessingHours,input.settings.defaultPostProcessingHourlyCostCents);
  const packagingCostCents=Math.max(0,Math.round(input.costing.packagingCostCents));
  const localDeliveryInternalCostCents=Math.max(0,Math.round(input.costing.localDeliveryInternalCostCents));
  const miscellaneousCostCents=Math.max(0,Math.round(input.costing.miscellaneousCostCents));
  const shippingCost=shippingInternalCost(input.quote,input.shipment);
  const nonPaymentDirectCostCents=materialTotal+machineCost+designCost+laborCost+postProcessingCost+packagingCostCents+localDeliveryInternalCostCents+miscellaneousCostCents+shippingCost;
  const quotedRevenueCents=Math.max(0,input.quote.totalCents);
  const metrics=contributionMetrics(quotedRevenueCents,nonPaymentDirectCostCents,input.settings);
  const suggestedPriceCents=suggestedRevenueCents(nonPaymentDirectCostCents,input.settings);
  const sources=[...new Set(materialLines.map(line=>line.costSource))];
  return {
    id:input.status==="estimate"?quoteEstimateId(input.quote.id,input.quote.revision):quoteActualId(input.quote.id,input.quote.revision),
    requestId:input.quote.requestId,
    requestCode:input.quote.requestCode,
    quoteId:input.quote.id,
    quoteRevision:input.quote.revision,
    status:input.status,
    materialLines,
    machineHours:input.costing.machineHours,
    machineHourlyCostCents:input.settings.defaultMachineHourlyCostCents,
    designHours:input.costing.designHours,
    designHourlyCostCents:input.settings.defaultDesignHourlyCostCents,
    laborHours:input.costing.laborHours,
    laborHourlyCostCents:input.settings.defaultLaborHourlyCostCents,
    postProcessingHours:input.costing.postProcessingHours,
    postProcessingHourlyCostCents:input.settings.defaultPostProcessingHourlyCostCents,
    packagingCostCents,
    localDeliveryInternalCostCents,
    miscellaneousCostCents,
    paymentFeeCents:metrics.paymentFeeCents,
    shippingInternalCostCents:shippingCost,
    nonPaymentDirectCostCents,
    directCostCents:metrics.directCostCents,
    quotedRevenueCents,
    contributionProfitCents:metrics.contributionProfitCents,
    contributionMarginBasisPoints:metrics.contributionMarginBasisPoints,
    targetMarginBasisPoints:input.settings.targetContributionMarginBasisPoints,
    suggestedPriceCents,
    priceMeetsTarget:metrics.contributionMarginBasisPoints>=input.settings.targetContributionMarginBasisPoints,
    costingSourceSummary:sources.join(", ")||"unpriced",
    createdAt:input.now,
    updatedAt:input.now,
    finalizedAt:input.status==="finalized"?input.now:"",
  };
}

export function quoteCostInputFromSnapshot(snapshot:QuoteCostSnapshot):QuoteCostInput{
  return {
    materialLines:snapshot.materialLines.map(line=>({id:line.id,catalogItemId:line.catalogItemId,grams:line.grams})),
    machineHours:snapshot.machineHours,
    designHours:snapshot.designHours,
    laborHours:snapshot.laborHours,
    postProcessingHours:snapshot.postProcessingHours,
    packagingCostCents:snapshot.packagingCostCents,
    localDeliveryInternalCostCents:snapshot.localDeliveryInternalCostCents,
    miscellaneousCostCents:snapshot.miscellaneousCostCents,
  };
}

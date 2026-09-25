import type { BambuFilamentCatalogItem, FilamentPurchaseLot } from './pricing-types.ts';

export type WeightedActualMaterialCost={
  totalGrams:number;
  totalCostCents:number;
  costPerGramMicros:number;
  latestPurchaseCostPerGramMicros:number;
};
export type ResolvedMaterialCost={
  source:'actual-average'|'bambu-msrp'|'manual-fallback'|'unpriced';
  costPerGramMicros:number;
  latestPurchaseCostPerGramMicros:number;
  averageActualCostPerGramMicros:number;
  msrpCostPerGramMicros:number;
  savingsVsMsrpBasisPoints:number;
};

export function weightedActualCostPerGram(catalogItemId:string,lots:FilamentPurchaseLot[]):WeightedActualMaterialCost{
  const matches=lots.filter(x=>x.catalogItemId===catalogItemId&&x.quantity>0&&x.netWeightGramsPerUnit>0&&x.landedLineCostCents>=0);
  const totalGrams=matches.reduce((sum,x)=>sum+x.quantity*x.netWeightGramsPerUnit,0);
  const totalCostCents=matches.reduce((sum,x)=>sum+x.landedLineCostCents,0);
  const costPerGramMicros=totalGrams>0?Math.round(totalCostCents*1_000_000/totalGrams):0;
  const latest=[...matches].sort((a,b)=>b.orderDate.localeCompare(a.orderDate)||b.createdAt.localeCompare(a.createdAt))[0];
  const latestPurchaseCostPerGramMicros=latest
    ? (latest.landedCostPerGramMicros>0?latest.landedCostPerGramMicros:Math.round(latest.landedLineCostCents*1_000_000/(latest.quantity*latest.netWeightGramsPerUnit)))
    : 0;
  return {totalGrams,totalCostCents,costPerGramMicros,latestPurchaseCostPerGramMicros};
}

export function resolveMaterialCost(catalogItem:BambuFilamentCatalogItem,lots:FilamentPurchaseLot[]):ResolvedMaterialCost{
  const actual=weightedActualCostPerGram(catalogItem.id,lots);
  let source:ResolvedMaterialCost['source']='unpriced';
  let costPerGramMicros=0;
  if(actual.costPerGramMicros>0){source='actual-average';costPerGramMicros=actual.costPerGramMicros;}
  else if(catalogItem.msrpCostPerGramMicros>0){source='bambu-msrp';costPerGramMicros=catalogItem.msrpCostPerGramMicros;}
  else if(catalogItem.manualFallbackCostPerGramMicros>0){source='manual-fallback';costPerGramMicros=catalogItem.manualFallbackCostPerGramMicros;}
  const msrp=Math.max(0,catalogItem.msrpCostPerGramMicros||0);
  const savingsVsMsrpBasisPoints=msrp>0&&actual.costPerGramMicros>0?Math.round((msrp-actual.costPerGramMicros)/msrp*10_000):0;
  return {source,costPerGramMicros,latestPurchaseCostPerGramMicros:actual.latestPurchaseCostPerGramMicros,averageActualCostPerGramMicros:actual.costPerGramMicros,msrpCostPerGramMicros:msrp,savingsVsMsrpBasisPoints};
}

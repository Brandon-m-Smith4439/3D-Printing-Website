import type { PricingSettings } from "./pricing-types.ts";

export function costPerGramMicros(totalCostCents:number, netWeightGrams:number){
  if(!Number.isFinite(totalCostCents)||totalCostCents<0) throw new Error("Cost must be non-negative.");
  if(!Number.isFinite(netWeightGrams)||netWeightGrams<=0) throw new Error("Net weight must be greater than zero.");
  return Math.round((totalCostCents*1_000_000)/netWeightGrams);
}
export function materialCostCents(grams:number,costPerGramValueMicros:number){
  if(!Number.isFinite(grams)||grams<=0||!Number.isFinite(costPerGramValueMicros)||costPerGramValueMicros<=0)return 0;
  return Math.round((grams*costPerGramValueMicros)/1_000_000);
}
export function paymentFeeCents(revenueCents:number,settings:Pick<PricingSettings,"defaultPaymentFeePercentBasisPoints"|"defaultPaymentFeeFixedCents">){
  if(!Number.isFinite(revenueCents)||revenueCents<=0)return 0;
  return Math.round(revenueCents*Math.max(0,settings.defaultPaymentFeePercentBasisPoints)/10_000)+Math.max(0,settings.defaultPaymentFeeFixedCents);
}
export function suggestedRevenueCents(nonPaymentDirectCostCents:number,settings:Pick<PricingSettings,"targetContributionMarginBasisPoints"|"defaultPaymentFeePercentBasisPoints"|"defaultPaymentFeeFixedCents">){
  const target=Math.max(0,settings.targetContributionMarginBasisPoints)/10_000;
  const feeRate=Math.max(0,settings.defaultPaymentFeePercentBasisPoints)/10_000;
  const denominator=1-target-feeRate;
  if(denominator<=0)throw new Error("Target margin and payment fee assumptions leave no valid selling price.");
  return Math.ceil((Math.max(0,nonPaymentDirectCostCents)+Math.max(0,settings.defaultPaymentFeeFixedCents))/denominator);
}
export function contributionMetrics(revenueCents:number,nonPaymentDirectCostCents:number,settings:Pick<PricingSettings,"targetContributionMarginBasisPoints"|"defaultPaymentFeePercentBasisPoints"|"defaultPaymentFeeFixedCents">){
  const fee=paymentFeeCents(revenueCents,settings); const directCostCents=Math.max(0,nonPaymentDirectCostCents)+fee; const contributionProfitCents=Math.max(0,revenueCents)-directCostCents;
  const contributionMarginBasisPoints=revenueCents>0?Math.round(contributionProfitCents/revenueCents*10_000):0;
  return {paymentFeeCents:fee,directCostCents,contributionProfitCents,contributionMarginBasisPoints};
}

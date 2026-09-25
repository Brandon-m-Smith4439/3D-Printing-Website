export type BambuMaterialClass = "PLA" | "PETG" | "ABS" | "ASA" | "PC" | "TPU" | "PA" | "PET" | "PPA" | "PVA" | "SUPPORT" | "OTHER";
export type BambuPackageType = "refill" | "with-spool" | "filament-only";

export type BambuFilamentCatalogItem = {
  id:string; manufacturer:"Bambu Lab"; familyKey:string; displayName:string; materialClass:BambuMaterialClass; packageType:BambuPackageType;
  netWeightGrams:number; msrpCents:number; msrpCostPerGramMicros:number; manualFallbackCostPerGramMicros:number; active:boolean;
  sourceUrl:string; sourceLabel:string; lastVerifiedAt:string; notes:string; createdAt:string; updatedAt:string;
};

export type FilamentPurchaseLot = {
  id:string; invoiceImportId:string; vendor:"Bambu Lab"; orderNumber:string; orderDate:string; catalogItemId:string; productNameRaw:string; skuRaw:string;
  colorName:string; colorCode:string; packageType:BambuPackageType; netWeightGramsPerUnit:number; quantity:number; unitListPriceCents:number;
  directLineDiscountCents:number; allocatedOrderDiscountCents:number; allocatedShippingCents:number; allocatedTaxCents:number;
  landedLineCostCents:number; landedUnitCostCents:number; landedCostPerGramMicros:number; currency:"usd"; createdAt:string;
};

export type PricingSettings = {
  targetContributionMarginBasisPoints:number; defaultMachineHourlyCostCents:number; defaultDesignHourlyCostCents:number; defaultLaborHourlyCostCents:number;
  defaultPostProcessingHourlyCostCents:number; defaultPackagingCostCents:number; defaultPaymentFeePercentBasisPoints:number; defaultPaymentFeeFixedCents:number;
  includeInvoiceTaxInMaterialCost:boolean; includeInvoiceShippingInMaterialCost:boolean; actualMaterialCostMethod:"weighted-average"; updatedAt:string;
};

export type QuoteCostMaterialLineInput = { id:string; catalogItemId:string; grams:number };
export type QuoteCostInput = { materialLines:QuoteCostMaterialLineInput[]; machineHours:number; designHours:number; laborHours:number; postProcessingHours:number; packagingCostCents:number; localDeliveryInternalCostCents:number; miscellaneousCostCents:number };
export type QuoteCostResolvedMaterialLine = QuoteCostMaterialLineInput & { displayName:string; costSource:"actual-average"|"bambu-msrp"|"manual-fallback"|"unpriced"; costPerGramMicros:number; extendedCostCents:number };
export type QuoteCostSnapshot = {
  id:string; requestId:string; requestCode:string; quoteId:string; quoteRevision:number; status:"estimate"|"actual"|"finalized"; materialLines:QuoteCostResolvedMaterialLine[];
  machineHours:number; machineHourlyCostCents:number; designHours:number; designHourlyCostCents:number; laborHours:number; laborHourlyCostCents:number;
  postProcessingHours:number; postProcessingHourlyCostCents:number; packagingCostCents:number; localDeliveryInternalCostCents:number; miscellaneousCostCents:number;
  paymentFeeCents:number; shippingInternalCostCents:number; nonPaymentDirectCostCents:number; directCostCents:number; quotedRevenueCents:number;
  contributionProfitCents:number; contributionMarginBasisPoints:number; targetMarginBasisPoints:number; suggestedPriceCents:number; priceMeetsTarget:boolean;
  costingSourceSummary:string; createdAt:string; updatedAt:string; finalizedAt:string;
};
export type PricingPreset = { id:string; name:string; description:string; projectType:string; quoteDefaults:{material:string;dimensions:string;assemblyMode:"assembled"|"disassembled"|"not-required";assemblyFeeCents:number;rushFeeCents:number;fulfillmentMode:"pickup"|"shipping"|"local-delivery";localDeliveryFeeCents:number;basePriceCents:number}; costing:QuoteCostInput; createdAt:string; updatedAt:string };

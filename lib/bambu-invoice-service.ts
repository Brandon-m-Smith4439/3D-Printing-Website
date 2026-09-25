import 'server-only';
import { allocateBambuInvoice } from './bambu-invoice-allocation.ts';
import { findBambuInvoiceImport, updateBambuInvoiceImport } from './bambu-invoice-store.ts';
import { writePostedPurchaseLots } from './bambu-purchase-store.ts';
import type { FilamentPurchaseLot, PricingSettings } from './pricing-types.ts';

export async function postBambuInvoiceImport(
  importId:string,
  settings:Pick<PricingSettings,'includeInvoiceTaxInMaterialCost'|'includeInvoiceShippingInMaterialCost'>,
){
  const record=await findBambuInvoiceImport(importId);
  if(!record)throw new Error('Bambu invoice import not found.');
  if(record.parseStatus==='posted'||record.postedAt)throw new Error('Bambu invoice is already posted.');
  if(record.parseStatus!=='parsed')throw new Error('Bambu invoice must be fully reviewed and reconciled before posting.');
  const unmatched=record.lines.filter(line=>line.isFilament&&(!line.catalogItemId||line.netWeightGramsPerUnit<=0));
  if(unmatched.length)throw new Error('All filament lines must be mapped before posting.');
  const allocated=allocateBambuInvoice({lines:record.lines,orderDiscountCents:record.discountCents,shippingCents:record.shippingCents,taxCents:record.taxCents,settings});
  const now=new Date().toISOString();
  const lots:FilamentPurchaseLot[]=allocated.filter(line=>line.isFilament&&line.catalogItemId).map(line=>({
    id:`${record.id}:${line.id}`,
    invoiceImportId:record.id,
    vendor:'Bambu Lab',
    orderNumber:record.orderNumber,
    orderDate:record.orderDate,
    catalogItemId:line.catalogItemId,
    productNameRaw:line.productNameRaw,
    skuRaw:line.skuRaw,
    colorName:line.colorName,
    colorCode:'',
    packageType:line.packageType,
    netWeightGramsPerUnit:line.netWeightGramsPerUnit,
    quantity:line.quantity,
    unitListPriceCents:line.unitListPriceCents,
    directLineDiscountCents:line.directLineDiscountCents,
    allocatedOrderDiscountCents:line.allocatedOrderDiscountCents,
    allocatedShippingCents:line.allocatedShippingCents,
    allocatedTaxCents:line.allocatedTaxCents,
    landedLineCostCents:line.landedLineCostCents,
    landedUnitCostCents:line.landedUnitCostCents,
    landedCostPerGramMicros:line.landedCostPerGramMicros,
    currency:'usd',
    createdAt:now,
  }));
  await writePostedPurchaseLots(record.id,lots);
  const importRecord=await updateBambuInvoiceImport(record.id,{parseStatus:'posted',postedAt:now});
  return {importRecord,lots};
}

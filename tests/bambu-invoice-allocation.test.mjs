import assert from 'node:assert/strict';
import { allocateBambuInvoice } from '../lib/bambu-invoice-allocation.ts';

const lines=[
  {id:'l1',productNameRaw:'PLA Basic Refill Black',skuRaw:'A00',colorName:'Black',quantity:2,unitListPriceCents:1999,directLineDiscountCents:500,lineSubtotalCents:3998,catalogItemId:'pla-basic-refill',isFilament:true,packageType:'refill',netWeightGramsPerUnit:1000},
  {id:'l2',productNameRaw:'PVA',skuRaw:'PVA',colorName:'Natural',quantity:1,unitListPriceCents:3999,directLineDiscountCents:0,lineSubtotalCents:3999,catalogItemId:'pva',isFilament:true,packageType:'with-spool',netWeightGramsPerUnit:500},
  {id:'l3',productNameRaw:'Reusable Spool',skuRaw:'SPOOL',colorName:'',quantity:1,unitListPriceCents:1199,directLineDiscountCents:0,lineSubtotalCents:1199,catalogItemId:'',isFilament:false,packageType:'filament-only',netWeightGramsPerUnit:0},
];
const settings={includeInvoiceTaxInMaterialCost:true,includeInvoiceShippingInMaterialCost:true};
const allocated=allocateBambuInvoice({lines,orderDiscountCents:2000,shippingCents:1000,taxCents:800,settings});
assert.equal(allocated.length,3);
assert.equal(allocated.reduce((s,x)=>s+x.allocatedOrderDiscountCents,0),2000);
assert.equal(allocated.reduce((s,x)=>s+x.allocatedShippingCents,0),1000);
assert.equal(allocated.reduce((s,x)=>s+x.allocatedTaxCents,0),800);
const filament=allocated.filter(x=>x.isFilament);
assert.equal(filament.length,2);
for(const line of filament){assert.ok(line.landedLineCostCents>=0);assert.ok(line.landedUnitCostCents>=0);assert.ok(line.landedCostPerGramMicros>0);}

const noShared=allocateBambuInvoice({lines,orderDiscountCents:0,shippingCents:0,taxCents:0,settings});
assert.equal(noShared[0].landedLineCostCents,3498);

const excluded=allocateBambuInvoice({lines,orderDiscountCents:2000,shippingCents:1000,taxCents:800,settings:{includeInvoiceTaxInMaterialCost:false,includeInvoiceShippingInMaterialCost:false}});
assert.equal(excluded.reduce((s,x)=>s+x.allocatedShippingCents,0),0);
assert.equal(excluded.reduce((s,x)=>s+x.allocatedTaxCents,0),0);
assert.equal(excluded.reduce((s,x)=>s+x.allocatedOrderDiscountCents,0),2000);

const odd=allocateBambuInvoice({lines:[
  {id:'a',productNameRaw:'PLA Basic Refill',skuRaw:'',colorName:'',quantity:1,unitListPriceCents:1000,directLineDiscountCents:0,lineSubtotalCents:1000,catalogItemId:'pla-basic-refill',isFilament:true,packageType:'refill',netWeightGramsPerUnit:1000},
  {id:'b',productNameRaw:'Accessory',skuRaw:'',colorName:'',quantity:1,unitListPriceCents:1000,directLineDiscountCents:0,lineSubtotalCents:1000,catalogItemId:'',isFilament:false,packageType:'filament-only',netWeightGramsPerUnit:0},
],orderDiscountCents:1,shippingCents:1,taxCents:1,settings});
assert.equal(odd.reduce((s,x)=>s+x.allocatedOrderDiscountCents,0),1);
assert.equal(odd.reduce((s,x)=>s+x.allocatedShippingCents,0),1);
assert.equal(odd.reduce((s,x)=>s+x.allocatedTaxCents,0),1);
console.log('Bambu invoice allocation checks passed.');

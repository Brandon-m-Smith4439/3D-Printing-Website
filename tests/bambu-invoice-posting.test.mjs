import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
const db=`/tmp/meshharbor-bambu-post-${process.pid}.sqlite`;
process.env.DATABASE_PATH=db;
await rm(db,{force:true});
const invoiceStore=await import('../lib/bambu-invoice-store.ts');
const purchaseStore=await import('../lib/bambu-purchase-store.ts');
const { postBambuInvoiceImport }=await import('../lib/bambu-invoice-service.ts');
const lines=[
{id:'l1',productNameRaw:'PLA Basic Refill',skuRaw:'PLA',colorName:'Black',quantity:2,unitListPriceCents:1999,directLineDiscountCents:500,lineSubtotalCents:3998,catalogItemId:'pla-basic-refill',isFilament:true,packageType:'refill',netWeightGramsPerUnit:1000},
{id:'l2',productNameRaw:'PVA',skuRaw:'PVA',colorName:'Natural',quantity:1,unitListPriceCents:3999,directLineDiscountCents:0,lineSubtotalCents:3999,catalogItemId:'pva',isFilament:true,packageType:'with-spool',netWeightGramsPerUnit:500},
{id:'l3',productNameRaw:'Reusable Spool',skuRaw:'SPOOL',colorName:'',quantity:1,unitListPriceCents:1199,directLineDiscountCents:0,lineSubtotalCents:1199,catalogItemId:'',isFilament:false,packageType:'filament-only',netWeightGramsPerUnit:0},
];
await invoiceStore.createBambuInvoiceImport({id:'imp-1',originalFileName:'invoice.pdf',privateObjectKey:'pricing-invoices/a.pdf',sha256:'hash-1',orderNumber:'ORDER-1',orderDate:'2026-09-20',subtotalCents:8696,discountCents:1000,shippingCents:500,taxCents:600,totalCents:8796,parseStatus:'parsed',parserVersion:'1',rawLineCount:3,matchedFilamentLineCount:2,unmatchedLineCount:0,warnings:[],lines,createdAt:'2026-09-25T12:00:00.000Z',updatedAt:'2026-09-25T12:00:00.000Z',postedAt:''});
const posted=await postBambuInvoiceImport('imp-1',{includeInvoiceTaxInMaterialCost:true,includeInvoiceShippingInMaterialCost:true});
assert.equal(posted.importRecord.parseStatus,'posted');
assert.ok(posted.importRecord.postedAt);
assert.equal(posted.lots.length,2);
assert.equal((await purchaseStore.readFilamentPurchaseLots()).length,2);
assert.ok(posted.lots.every(x=>x.invoiceImportId==='imp-1'&&x.landedCostPerGramMicros>0));
await assert.rejects(()=>postBambuInvoiceImport('imp-1',{includeInvoiceTaxInMaterialCost:true,includeInvoiceShippingInMaterialCost:true}),/already posted/i);
await rm(db,{force:true});
console.log('Bambu invoice posting checks passed.');

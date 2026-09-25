import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const db=`/tmp/meshharbor-pricing-store-${process.pid}.sqlite`;
process.env.DATABASE_PATH=db;
await rm(db,{force:true});

const store=await import('../lib/pricing-store.ts');
const settings=await store.readPricingSettings();
assert.equal(settings.targetContributionMarginBasisPoints,0);
assert.equal(settings.defaultMachineHourlyCostCents,0);
assert.equal(settings.defaultLaborHourlyCostCents,0);
assert.equal(settings.actualMaterialCostMethod,'weighted-average');

await store.ensureBambuCatalogSeeded();
const catalog=await store.readBambuCatalog();
assert.ok(catalog.length>=30,`expected at least 30 current Bambu catalog entries, got ${catalog.length}`);
assert.ok(catalog.some(x=>x.netWeightGrams===1000));
assert.ok(catalog.some(x=>x.netWeightGrams===500));
assert.ok(catalog.some(x=>x.netWeightGrams===750));
for(const item of catalog){
  assert.equal(item.manufacturer,'Bambu Lab');
  assert.ok(item.netWeightGrams>0,item.id);
  assert.ok(item.msrpCents>0,item.id);
  assert.ok(item.msrpCostPerGramMicros>0,item.id);
  assert.match(item.sourceUrl,/^https:\/\//,item.id);
  assert.ok(item.lastVerifiedAt,item.id);
}
for(const family of ['PLA Basic','PLA Matte','PLA Pure','PLA Translucent','PLA Silk Multi-Color','PETG HF','PETG Translucent','PETG-CF','ABS','ABS-GF','ASA','ASA Aero','ASA-CF','TPU for AMS','TPU 95A HF','TPU 85A','TPU 90A','PC','PC FR','PA6-GF','PA6-CF','PAHT-CF','PPA-CF','PET-CF','PPS-CF','Support for PLA (New Version)','Support for PLA/PETG','Support for ABS','Support for PA/PET','PVA']){
  assert.ok(catalog.some(x=>x.displayName.includes(family)),`missing ${family}`);
}
const basic=catalog.find(x=>x.id==='pla-basic-refill');
assert.ok(basic);
const edited=await store.upsertBambuCatalogItem({...basic,manualFallbackCostPerGramMicros:123456,notes:'owner override'});
assert.equal(edited.manualFallbackCostPerGramMicros,123456);
await store.ensureBambuCatalogSeeded();
const basicAgain=(await store.readBambuCatalog()).find(x=>x.id==='pla-basic-refill');
assert.equal(basicAgain.manualFallbackCostPerGramMicros,123456);
assert.equal(basicAgain.notes,'owner override');

await store.updatePricingSettings({targetContributionMarginBasisPoints:4500,defaultMachineHourlyCostCents:350});
const updated=await store.readPricingSettings();
assert.equal(updated.targetContributionMarginBasisPoints,4500);
assert.equal(updated.defaultMachineHourlyCostCents,350);
assert.throws(()=>store.validatePricingSettings({...updated,targetContributionMarginBasisPoints:9500,defaultPaymentFeePercentBasisPoints:600}),/no valid selling price/i);

await rm(db,{force:true});
console.log('Pricing store checks passed.');

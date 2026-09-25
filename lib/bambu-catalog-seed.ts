import { costPerGramMicros } from './pricing-math.ts';
import type { BambuFilamentCatalogItem, BambuMaterialClass, BambuPackageType } from './pricing-types.ts';

const VERIFIED_AT='2026-09-25T14:30:00.000Z';
const STORE='https://bambulab-us.myshopify.com';

type SeedInput={id:string;familyKey:string;displayName:string;materialClass:BambuMaterialClass;packageType:BambuPackageType;netWeightGrams:number;msrpCents:number;sourceUrl:string};
function row(input:SeedInput):BambuFilamentCatalogItem{
  return {...input,manufacturer:'Bambu Lab',msrpCostPerGramMicros:costPerGramMicros(input.msrpCents,input.netWeightGrams),manualFallbackCostPerGramMicros:0,active:true,sourceLabel:'Bambu Lab US official store',lastVerifiedAt:VERIFIED_AT,notes:'',createdAt:VERIFIED_AT,updatedAt:VERIFIED_AT};
}

// Reference/MSRP seed only. Posted Bambu invoices take precedence for costing.
// Families reflect the official US filament navigation verified on 2026-09-25.
export const bambuCatalogSeed:BambuFilamentCatalogItem[]=[
  row({id:'pla-basic-refill',familyKey:'pla-basic',displayName:'PLA Basic — Refill',materialClass:'PLA',packageType:'refill',netWeightGrams:1000,msrpCents:1999,sourceUrl:`${STORE}/products/pla-basic-filament`}),
  row({id:'pla-basic-spool',familyKey:'pla-basic',displayName:'PLA Basic — With Spool',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/products/pla-basic-filament`}),
  row({id:'pla-matte-refill',familyKey:'pla-matte',displayName:'PLA Matte — Refill',materialClass:'PLA',packageType:'refill',netWeightGrams:1000,msrpCents:1999,sourceUrl:`${STORE}/products/pla-matte`}),
  row({id:'pla-matte-spool',familyKey:'pla-matte',displayName:'PLA Matte — With Spool',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/products/pla-matte`}),
  row({id:'pla-pure-refill',familyKey:'pla-pure',displayName:'PLA Pure — Refill',materialClass:'PLA',packageType:'refill',netWeightGrams:1000,msrpCents:1699,sourceUrl:'https://blog.bambulab.com/introducing-bambu-lab-pla-pure-a-filament-made-for-printing-where-you-live/'}),
  row({id:'pla-translucent',familyKey:'pla-translucent',displayName:'PLA Translucent',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-silk-multicolor',familyKey:'pla-silk-multicolor',displayName:'PLA Silk Multi-Color',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-silk-plus',familyKey:'pla-silk-plus',displayName:'PLA Silk+',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-silk-dual',familyKey:'pla-silk-dual',displayName:'PLA Silk Dual Color',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-wood',familyKey:'pla-wood',displayName:'PLA Wood',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-basic-gradient',familyKey:'pla-basic-gradient',displayName:'PLA Basic Gradient',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-galaxy',familyKey:'pla-galaxy',displayName:'PLA Galaxy',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-metal',familyKey:'pla-metal',displayName:'PLA Metal',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-sparkle',familyKey:'pla-sparkle',displayName:'PLA Sparkle',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-marble',familyKey:'pla-marble',displayName:'PLA Marble',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-aero',familyKey:'pla-aero',displayName:'PLA Aero',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:4499,sourceUrl:`${STORE}/products/pla-aero`}),
  row({id:'pla-cf-refill',familyKey:'pla-cf',displayName:'PLA-CF — Refill',materialClass:'PLA',packageType:'refill',netWeightGrams:1000,msrpCents:3199,sourceUrl:`${STORE}/products/pla-cf`}),
  row({id:'pla-cf-spool',familyKey:'pla-cf',displayName:'PLA-CF — With Spool',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:3499,sourceUrl:`${STORE}/products/pla-cf`}),
  row({id:'pla-glow',familyKey:'pla-glow',displayName:'PLA Glow',materialClass:'PLA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2499,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'pla-cmyk-bundle',familyKey:'pla-cmyk',displayName:'PLA CMYK Lithophane Bundle',materialClass:'PLA',packageType:'filament-only',netWeightGrams:4000,msrpCents:6999,sourceUrl:`${STORE}/collections/pla`}),
  row({id:'petg-hf-refill',familyKey:'petg-hf',displayName:'PETG HF — Refill',materialClass:'PETG',packageType:'refill',netWeightGrams:1000,msrpCents:1999,sourceUrl:`${STORE}/pages/bambu-filament`}),
  row({id:'petg-hf-spool',familyKey:'petg-hf',displayName:'PETG HF — With Spool',materialClass:'PETG',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/pages/bambu-filament`}),
  row({id:'petg-translucent-refill',familyKey:'petg-translucent',displayName:'PETG Translucent — Refill',materialClass:'PETG',packageType:'refill',netWeightGrams:1000,msrpCents:1999,sourceUrl:`${STORE}/collections/petg`}),
  row({id:'petg-translucent-spool',familyKey:'petg-translucent',displayName:'PETG Translucent — With Spool',materialClass:'PETG',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/collections/petg`}),
  row({id:'petg-cf-refill',familyKey:'petg-cf',displayName:'PETG-CF — Refill',materialClass:'PETG',packageType:'refill',netWeightGrams:1000,msrpCents:3199,sourceUrl:`${STORE}/products/petg-cf`}),
  row({id:'petg-cf-spool',familyKey:'petg-cf',displayName:'PETG-CF — With Spool',materialClass:'PETG',packageType:'with-spool',netWeightGrams:1000,msrpCents:3499,sourceUrl:`${STORE}/products/petg-cf`}),
  row({id:'abs-refill',familyKey:'abs',displayName:'ABS — Refill',materialClass:'ABS',packageType:'refill',netWeightGrams:1000,msrpCents:1999,sourceUrl:`${STORE}/pages/bambu-filament`}),
  row({id:'abs-spool',familyKey:'abs',displayName:'ABS — With Spool',materialClass:'ABS',packageType:'with-spool',netWeightGrams:1000,msrpCents:2299,sourceUrl:`${STORE}/pages/bambu-filament`}),
  row({id:'abs-gf',familyKey:'abs-gf',displayName:'ABS-GF',materialClass:'ABS',packageType:'with-spool',netWeightGrams:1000,msrpCents:2999,sourceUrl:`${STORE}/products/abs-gf`}),
  row({id:'asa',familyKey:'asa',displayName:'ASA',materialClass:'ASA',packageType:'with-spool',netWeightGrams:1000,msrpCents:2999,sourceUrl:`${STORE}/products/asa-filament`}),
  row({id:'asa-aero',familyKey:'asa-aero',displayName:'ASA Aero',materialClass:'ASA',packageType:'with-spool',netWeightGrams:1000,msrpCents:4999,sourceUrl:`${STORE}/products/asa-aero`}),
  row({id:'asa-cf',familyKey:'asa-cf',displayName:'ASA-CF',materialClass:'ASA',packageType:'with-spool',netWeightGrams:1000,msrpCents:3699,sourceUrl:`${STORE}/products/asa-cf`}),
  row({id:'tpu-for-ams',familyKey:'tpu-for-ams',displayName:'TPU for AMS',materialClass:'TPU',packageType:'with-spool',netWeightGrams:1000,msrpCents:3899,sourceUrl:`${STORE}/products/tpu-for-ams`}),
  row({id:'tpu-85a',familyKey:'tpu-85a',displayName:'TPU 85A',materialClass:'TPU',packageType:'with-spool',netWeightGrams:1000,msrpCents:4199,sourceUrl:`${STORE}/products/tpu-85a-tpu-90a`}),
  row({id:'tpu-90a',familyKey:'tpu-90a',displayName:'TPU 90A',materialClass:'TPU',packageType:'with-spool',netWeightGrams:1000,msrpCents:4199,sourceUrl:`${STORE}/products/tpu-85a-tpu-90a`}),
  row({id:'tpu-95a-hf',familyKey:'tpu-95a-hf',displayName:'TPU 95A HF',materialClass:'TPU',packageType:'with-spool',netWeightGrams:1000,msrpCents:4199,sourceUrl:`${STORE}/products/tpu-95a-hf`}),
  row({id:'pc',familyKey:'pc',displayName:'PC',materialClass:'PC',packageType:'with-spool',netWeightGrams:1000,msrpCents:3999,sourceUrl:`${STORE}/products/pc-filament`}),
  row({id:'pc-fr',familyKey:'pc-fr',displayName:'PC FR',materialClass:'PC',packageType:'with-spool',netWeightGrams:1000,msrpCents:5499,sourceUrl:`${STORE}/products/pc-fr`}),
  row({id:'pa6-gf',familyKey:'pa6-gf',displayName:'PA6-GF',materialClass:'PA',packageType:'with-spool',netWeightGrams:1000,msrpCents:5999,sourceUrl:`${STORE}/products/pa6-gf`}),
  row({id:'pa6-cf-500',familyKey:'pa6-cf',displayName:'PA6-CF — 0.5 kg',materialClass:'PA',packageType:'with-spool',netWeightGrams:500,msrpCents:4299,sourceUrl:`${STORE}/products/pa6-cf`}),
  row({id:'paht-cf-500',familyKey:'paht-cf',displayName:'PAHT-CF — 0.5 kg',materialClass:'PA',packageType:'with-spool',netWeightGrams:500,msrpCents:4999,sourceUrl:`${STORE}/products/paht-cf`}),
  row({id:'ppa-cf',familyKey:'ppa-cf',displayName:'PPA-CF',materialClass:'PPA',packageType:'with-spool',netWeightGrams:750,msrpCents:14999,sourceUrl:`${STORE}/products/ppa-cf`}),
  row({id:'pet-cf-500',familyKey:'pet-cf',displayName:'PET-CF — 0.5 kg',materialClass:'PET',packageType:'with-spool',netWeightGrams:500,msrpCents:4499,sourceUrl:`${STORE}/products/pet-cf`}),
  row({id:'pps-cf',familyKey:'pps-cf',displayName:'PPS-CF',materialClass:'OTHER',packageType:'with-spool',netWeightGrams:750,msrpCents:12999,sourceUrl:`${STORE}/products/pps-cf`}),
  row({id:'support-pla-new',familyKey:'support-pla-new',displayName:'Support for PLA (New Version)',materialClass:'SUPPORT',packageType:'with-spool',netWeightGrams:500,msrpCents:2299,sourceUrl:`${STORE}/collections/support`}),
  row({id:'support-pla-petg',familyKey:'support-pla-petg',displayName:'Support for PLA/PETG',materialClass:'SUPPORT',packageType:'with-spool',netWeightGrams:500,msrpCents:3499,sourceUrl:`${STORE}/products/support-for-pla-petg`}),
  row({id:'support-abs',familyKey:'support-abs',displayName:'Support for ABS',materialClass:'SUPPORT',packageType:'with-spool',netWeightGrams:500,msrpCents:1499,sourceUrl:`${STORE}/products/support-for-abs`}),
  row({id:'support-pa-pet',familyKey:'support-pa-pet',displayName:'Support for PA/PET',materialClass:'SUPPORT',packageType:'with-spool',netWeightGrams:500,msrpCents:3999,sourceUrl:`${STORE}/products/support-for-pa-pet`}),
  row({id:'pva',familyKey:'pva',displayName:'PVA',materialClass:'PVA',packageType:'with-spool',netWeightGrams:500,msrpCents:3999,sourceUrl:`${STORE}/products/pva`}),
];

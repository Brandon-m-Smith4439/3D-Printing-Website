import 'server-only';
import { readCollection, readSingleton, writeCollection, writeSingleton } from './database.ts';
import { bambuCatalogSeed } from './bambu-catalog-seed.ts';
import type { BambuFilamentCatalogItem, PricingSettings } from './pricing-types.ts';

const SETTINGS='pricing-settings';
const CATALOG='bambu-filament-catalog';
let mutationChain=Promise.resolve();
function mutate<T>(op:()=>Promise<T>):Promise<T>{const next=mutationChain.then(op,op);mutationChain=next.then(()=>undefined,()=>undefined);return next;}

export const DEFAULT_PRICING_SETTINGS:PricingSettings={
  targetContributionMarginBasisPoints:0,defaultMachineHourlyCostCents:0,defaultDesignHourlyCostCents:0,defaultLaborHourlyCostCents:0,
  defaultPostProcessingHourlyCostCents:0,defaultPackagingCostCents:0,defaultPaymentFeePercentBasisPoints:0,defaultPaymentFeeFixedCents:0,
  includeInvoiceTaxInMaterialCost:true,includeInvoiceShippingInMaterialCost:true,actualMaterialCostMethod:'weighted-average',updatedAt:'',
};

export function validatePricingSettings(input:PricingSettings){
  const ints:[keyof PricingSettings,number,number][]=[
    ['targetContributionMarginBasisPoints',0,9500],['defaultMachineHourlyCostCents',0,100000],['defaultDesignHourlyCostCents',0,100000],['defaultLaborHourlyCostCents',0,100000],
    ['defaultPostProcessingHourlyCostCents',0,100000],['defaultPackagingCostCents',0,100000],['defaultPaymentFeePercentBasisPoints',0,2000],['defaultPaymentFeeFixedCents',0,10000],
  ];
  for(const [key,min,max] of ints){const value=Number(input[key]);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${String(key)} is outside the allowed range.`);}
  if(input.targetContributionMarginBasisPoints+input.defaultPaymentFeePercentBasisPoints>=10000)throw new Error('Target margin and payment fee assumptions leave no valid selling price.');
  return input;
}

export async function readPricingSettings():Promise<PricingSettings>{
  const saved=await readSingleton<Partial<PricingSettings>>(SETTINGS);
  return {...DEFAULT_PRICING_SETTINGS,...(saved||{}),actualMaterialCostMethod:'weighted-average'};
}
export function updatePricingSettings(patch:Partial<PricingSettings>){return mutate(async()=>{const current=await readPricingSettings();const next=validatePricingSettings({...current,...patch,updatedAt:new Date().toISOString()});await writeSingleton(SETTINGS,next);return next;});}
export async function readBambuCatalog(){return (await readCollection<BambuFilamentCatalogItem>(CATALOG)).sort((a,b)=>a.materialClass.localeCompare(b.materialClass)||a.displayName.localeCompare(b.displayName));}
export async function findBambuCatalogItem(id:string){return (await readBambuCatalog()).find(x=>x.id===id)||null;}
export function replaceBambuCatalogSeed(items:BambuFilamentCatalogItem[]){return mutate(async()=>{await writeCollection(CATALOG,items);return items;});}
export function upsertBambuCatalogItem(item:BambuFilamentCatalogItem){return mutate(async()=>{const items=await readBambuCatalog();const index=items.findIndex(x=>x.id===item.id);const next={...item,updatedAt:new Date().toISOString()};if(index>=0)items[index]=next;else items.push(next);await writeCollection(CATALOG,items);return next;});}
export async function ensureBambuCatalogSeeded(){const existing=await readBambuCatalog();if(existing.length)return existing;return replaceBambuCatalogSeed(bambuCatalogSeed.map(x=>({...x})));}

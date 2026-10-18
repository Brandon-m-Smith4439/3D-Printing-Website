import {calculatePricing,salesSchema} from './sales.ts';
import type {SalesInput} from './sales.ts';
import type {ResolvedMaterialCost} from '../material-cost-resolver.ts';
import {packingPresetSchema,sliceResultSchema} from './slicing-types.ts';
import type {PackingPreset,PackingProposal,SliceResult} from './slicing-types.ts';
export function proposePacking(raw:SliceResult,quantity:number,presets:PackingPreset[],massAllowanceGrams:number,measuredPartGrams?:number):PackingProposal|null{
 const result=sliceResultSchema.parse(raw);
 if(!Number.isInteger(quantity)||quantity<1||quantity>100||!Number.isFinite(massAllowanceGrams)||massAllowanceGrams<0)throw Error('Invalid packing inputs');
 if(measuredPartGrams!==undefined&&(!Number.isFinite(measuredPartGrams)||measuredPartGrams<=0||measuredPartGrams>10000))throw Error('Invalid measured part weight');
 const partGrams=measuredPartGrams??result.partGrams;if(partGrams===null)return null;
 const [a,b,c]=result.sizeMm,orientations=[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];
 const fits=presets.map(p=>packingPresetSchema.parse(p)).filter(p=>p.available&&p.calibrated&&p.quantity===quantity&&(quantity>1||orientations.some(d=>d.every((v,i)=>v+2*p.clearanceMm<=p.internalMm[i]))));
 const volume=(p:PackingPreset)=>p.externalMm.reduce((n,v)=>n*v,1);
 fits.sort((x,y)=>x.packagingCents-y.packagingCents||volume(x)-volume(y)||x.id.localeCompare(y.id));
 const p=fits[0];if(!p)return null;
 const grams=(partGrams+massAllowanceGrams)*quantity+p.boxGrams+p.protectionGrams;
 return {presetId:p.id,presetName:p.name,boxGrams:p.boxGrams,protectionGrams:p.protectionGrams,clearanceMm:p.clearanceMm,quantity,grams,ounces:Math.ceil(grams/28.349523125),externalMm:p.externalMm,packagingCents:p.packagingCents,estimated:true};
}
export function proposeSales(raw:SliceResult,base:SalesInput,materials:{slot:number;cost:ResolvedMaterialCost;startupWasteGrams:number}[],pack:PackingProposal|null){
 const result=sliceResultSchema.parse(raw),input=salesSchema.parse(base);
 const lines=result.filaments.map(f=>{const m=materials.find(m=>m.slot===f.slot);if(!m||m.cost.source==='unpriced'||!Number.isFinite(m.cost.costPerGramMicros)||m.cost.costPerGramMicros<=0||!Number.isFinite(m.startupWasteGrams)||m.startupWasteGrams<0)return null;return {slot:f.slot,source:m.cost.source,consumedGrams:f.consumedGrams,startupWasteGrams:m.startupWasteGrams,cents:(f.consumedGrams+m.startupWasteGrams)*m.cost.costPerGramMicros/1000000};});
 input.materialCents=lines.every(l=>l!==null)?Math.ceil(lines.reduce((n,l)=>n+l!.cents,0)):null;
 input.printMinutes=result.seconds/60;input.packagingCents=pack?.packagingCents??null;
 input.costSource='Slicer estimate; per-filament recorded cost sources; packaging '+(pack?'calibrated preset':'unknown');
 input.physicalQuantities=[1];
 const pricing=calculatePricing(input);
 // This MVP only prices single physical units here; bundles need their own
 // packing and batch costing, never a copied single-unit packing cost.
 pricing.options=pricing.options.filter(o=>o.format==='digital'||(o.quantity===1&&pack?.quantity===1));
 return {input,pricing,lines};
}

import type { QuoteCostInput } from './pricing-types.ts';
function finite(value:unknown,label:string,max:number){const n=Number(value);if(!Number.isFinite(n)||n<0||n>max)throw new Error(`${label} is invalid.`);return n;}
export function validateQuoteCostInput(input:unknown):QuoteCostInput{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Costing input is invalid.');
  const raw=input as Record<string,unknown>;
  if(!Array.isArray(raw.materialLines)||raw.materialLines.length>20)throw new Error('Material lines are invalid.');
  const materialLines=raw.materialLines.map((value,index)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Material lines are invalid.');const line=value as Record<string,unknown>;const id=String(line.id||`material-${index+1}`).trim().slice(0,80);const catalogItemId=String(line.catalogItemId||'').trim().slice(0,120);if(!catalogItemId)throw new Error('Catalog item is required for each material line.');return{id,catalogItemId,grams:finite(line.grams,'Material grams',1_000_000)};});
  return{materialLines,machineHours:finite(raw.machineHours,'Machine hours',10_000),designHours:finite(raw.designHours,'Design hours',10_000),laborHours:finite(raw.laborHours,'Labor hours',10_000),postProcessingHours:finite(raw.postProcessingHours,'Post-processing hours',10_000),packagingCostCents:Math.round(finite(raw.packagingCostCents,'Packaging cost',1_000_000)),localDeliveryInternalCostCents:Math.round(finite(raw.localDeliveryInternalCostCents,'Internal delivery cost',1_000_000)),miscellaneousCostCents:Math.round(finite(raw.miscellaneousCostCents,'Miscellaneous cost',1_000_000))};
}

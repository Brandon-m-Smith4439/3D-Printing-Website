import type { AllocatedBambuInvoiceLine, ReviewedBambuInvoiceLine } from './bambu-invoice-types.ts';
import type { PricingSettings } from './pricing-types.ts';

function allocate(total:number,weights:number[]){
  const amount=Math.max(0,Math.round(total));
  const sum=weights.reduce((a,b)=>a+Math.max(0,b),0);
  const result=new Array(weights.length).fill(0);
  if(amount===0||sum===0)return result;
  let used=0;
  for(let i=0;i<weights.length;i+=1){
    if(i===weights.length-1){result[i]=amount-used;break;}
    result[i]=Math.floor(amount*Math.max(0,weights[i])/sum);
    used+=result[i];
  }
  return result;
}

export function allocateBambuInvoice(input:{
  lines:ReviewedBambuInvoiceLine[];
  orderDiscountCents:number;
  shippingCents:number;
  taxCents:number;
  settings:Pick<PricingSettings,'includeInvoiceTaxInMaterialCost'|'includeInvoiceShippingInMaterialCost'>;
}):AllocatedBambuInvoiceLine[]{
  const weights=input.lines.map(line=>Math.max(0,line.lineSubtotalCents-line.directLineDiscountCents));
  const discounts=allocate(input.orderDiscountCents,weights);
  const shipping=allocate(input.settings.includeInvoiceShippingInMaterialCost?input.shippingCents:0,weights);
  const tax=allocate(input.settings.includeInvoiceTaxInMaterialCost?input.taxCents:0,weights);
  return input.lines.map((line,index)=>{
    const base=Math.max(0,line.lineSubtotalCents-line.directLineDiscountCents);
    const landed=Math.max(0,base-discounts[index]+shipping[index]+tax[index]);
    const qty=Math.max(1,Math.round(line.quantity));
    const grams=line.isFilament?Math.max(0,line.netWeightGramsPerUnit)*qty:0;
    return {...line,
      allocatedOrderDiscountCents:discounts[index],
      allocatedShippingCents:shipping[index],
      allocatedTaxCents:tax[index],
      landedLineCostCents:landed,
      landedUnitCostCents:Math.round(landed/qty),
      landedCostPerGramMicros:grams>0?Math.round(landed*1_000_000/grams):0,
    };
  });
}

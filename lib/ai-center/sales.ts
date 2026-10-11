import {z} from 'zod';

const cents=z.number().int().min(0).max(1_000_000);
const cost=cents.nullable().default(null);
const fee=z.object({percentBps:z.number().int().min(0).max(5000),fixedCents:cents,listingCents:cents,adBps:z.number().int().min(0).max(5000)}).strict().refine(v=>v.percentBps+v.adBps<9000,'Combined percentage fees must be below 90%.');
export const comparableSchema=z.object({
 label:z.string().trim().min(1).max(120),url:z.url().max(1000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}),
 observedAt:z.iso.datetime(),format:z.enum(['physical','digital','unknown']),quantity:z.number().int().min(1).max(100).nullable(),priceCents:cents,currency:z.string().regex(/^[A-Z]{3}$/),shippingCents:cents.nullable(),matchConfirmed:z.boolean(),
}).strict();
export const salesSchema=z.object({
 materialCents:cost,printMinutes:z.number().positive().max(10000).nullable().default(null),printerCentsPerHour:cost,failureBps:z.number().int().min(0).max(5000).nullable().default(null),
 packagingCents:cost,handlingCents:cost,postageCents:cost,shippingChargedCents:cost,orderOverheadCents:cost,digitalSupportCents:cost,paymentTaxCents:cost,
 targetMarginBps:z.number().int().min(0).max(8000).default(4000),minContributionCents:cents.default(300),
 costSource:z.string().trim().min(1).max(500),fees:z.object({website:fee.nullable(),etsy:fee.nullable()}).strict(),
 comparables:z.array(comparableSchema).max(25).default([]),
}).strict();
export type SalesInput=z.infer<typeof salesSchema>;
export type PriceOption={channel:'website'|'etsy';format:'physical'|'digital';quantity:number;priceCents:number;minimumPriceCents:number;shippingChargedCents:number;variableCostCents:number;feesCents:number;contributionCents:number;marginBps:number;marketSampleCount:number;marketMedianCents:number|null;basis:string};
const physicalCosts=['materialCents','printMinutes','printerCentsPerHour','failureBps','packagingCents','handlingCents','postageCents','shippingChargedCents','orderOverheadCents','digitalSupportCents','paymentTaxCents'] as const;
// Asking-price comparisons are item/bundle prices. Shipping, variants and demand
// remain separate unknowns, rather than being silently treated as verified sales.
export function calculatePricing(raw:SalesInput,now=new Date()){
 const input=salesSchema.parse(raw),missing:string[]=physicalCosts.filter(k=>input[k]===null);
 for(const channel of ['website','etsy'] as const)if(!input.fees[channel])missing.push(`fees.${channel}`);
 const options:PriceOption[]=[];
 if(missing.length)return {missing,options,limitations:'Missing costs prevent recommendations. Enter explicit estimates, including zero where appropriate.'};
 for(const channel of ['website','etsy'] as const){
  const fees=input.fees[channel]!,percentage=(fees.percentBps+fees.adBps)/10000,margin=input.targetMarginBps/10000;
  if(percentage+margin>=1){missing.push(`${channel}: margin plus percentage fees must be below 100%`);continue;}
  for(const format of ['physical','digital'] as const)for(const quantity of format==='physical'?[1,3,5]:[1]){
   const shipping=format==='physical'?input.shippingChargedCents!:0;
   const production=quantity*(input.materialCents!+input.printMinutes!*input.printerCentsPerHour!/60)/(1-input.failureBps!/10000);
   const variable=Math.ceil(format==='physical'?production+input.packagingCents!+input.handlingCents!+input.postageCents!+input.orderOverheadCents!:input.digitalSupportCents!+input.orderOverheadCents!);
   const fixed=fees.fixedCents+fees.listingCents+Math.ceil(input.paymentTaxCents!*percentage);
   const marginFloor=(variable+fixed+1)/(1-percentage-margin)-shipping;
   const profitFloor=(variable+fixed+1+input.minContributionCents)/(1-percentage)-shipping;
   const seen=new Set<string>();
   const market=input.comparables.filter(c=>{
    const age=now.getTime()-Date.parse(c.observedAt);
    if(seen.has(c.url)||age<0||age>30*86400000||!c.matchConfirmed||c.format!==format||c.quantity!==quantity||c.currency!=='USD')return false;
    seen.add(c.url);return true;
   }).map(c=>c.priceCents).sort((a,b)=>a-b);
   const median=market.length?Math.round((market[Math.floor((market.length-1)/2)]+market[Math.floor(market.length/2)])/2):null;
   let price=Math.max(1,Math.ceil(Math.max(marginFloor,profitFloor,market.length>=3?median!:0)/50)*50);
   let charged=0,contribution=0,actualMargin=0;
   // Upward rounding preserves the floor after percentage fees round to cents.
   do{charged=Math.ceil((price+shipping)*percentage)+fixed;contribution=price+shipping-variable-charged;actualMargin=Math.floor(contribution/(price+shipping)*10000);if(contribution<input.minContributionCents||actualMargin<input.targetMarginBps)price+=50;else break;}while(price<=1_000_000);
   if(price>1_000_000){missing.push(`${channel}: computed price exceeds supported limit`);continue;}
   const minimumPriceCents=Math.max(1,Math.ceil(Math.max(marginFloor,profitFloor)));
   options.push({channel,format,quantity,priceCents:price,minimumPriceCents,shippingChargedCents:shipping,variableCostCents:variable,feesCents:charged,contributionCents:contribution,marginBps:actualMargin,marketSampleCount:market.length,marketMedianCents:median,basis:market.length>=3?'Comparable asking-price median, raised to cost floor; demand unverified':'Cost floor only; demand unverified'});
  }
 }
 return {missing,options,limitations:'Estimated contribution after entered variable costs, not net profit or guaranteed demand. Asking prices exclude competitor shipping unless separately supplied. Only confirmed same-format/bundle USD matches observed within 30 days enter the median. Taxes, advertising and overhead must be configured accurately. Test prices against real conversion and returns.'};
}
export function salesBrief(name:string,input:SalesInput,now=new Date()){
 const result=calculatePricing(input,now);
 const release=calculatePricing({...input,shippingChargedCents:0},now);
 const options=result.options.map(({channel,format,quantity,priceCents,minimumPriceCents,shippingChargedCents,contributionCents,marketSampleCount})=>({channel,format,quantity,priceCents,minimumPriceCents,releaseFloorCents:release.options.find(o=>o.channel===channel&&o.format===format&&o.quantity===quantity)?.minimumPriceCents??null,shippingChargedCents,contributionCents,marketSampleCount}));
 const sources=input.comparables.slice(0,3).map(c=>`${c.url.slice(0,100)} ${c.priceCents} ${c.currency} ${c.format} qty ${c.quantity??'?'} match ${c.matchConfirmed}`);
 // Bound optional context individually. Never cut off a calculated channel floor.
 return `Pricing/listing draft: propose price experiments using these computed floors. Never undercut a minimum. Draft a title/description; distinguish physical bundles from STL files. Missing costs block readiness; demand is unverified. No publishing or price changes.\nProduct: ${name.slice(0,100)}\nCost source (abbreviated): ${input.costSource.slice(0,160)}\nMissing: ${result.missing.join(', ').slice(0,300)||'none'}\nAll options in cents: ${JSON.stringify(options)}\nUp to 3 asking-price observations (URLs abbreviated; not sales): ${sources.join('; ')}`;
}

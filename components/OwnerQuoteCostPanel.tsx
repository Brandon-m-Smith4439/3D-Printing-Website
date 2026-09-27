"use client";
import { useMemo } from "react";
import type { BambuFilamentCatalogItem, PricingSettings, QuoteCostInput } from "@/lib/pricing-types";
import type { ResolvedMaterialCost } from "@/lib/material-cost-resolver";
import { contributionMetrics, materialCostCents, suggestedRevenueCents } from "@/lib/pricing-math";

function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
function dollars(cents:number){return (cents/100).toFixed(2);}
function number(value:string){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;}
function sourceLabel(source:ResolvedMaterialCost["source"]){return source==="actual-average"?"Invoice average":source==="bambu-msrp"?"Bambu MSRP":source==="manual-fallback"?"Manual cost":"Unpriced";}
function cleanFamilyName(name:string){return name.replace(/\s+—\s+(Refill|With Spool)$/i,"").replace(/\s+-\s+(Refill|With Spool)$/i,"");}

export type OwnerQuoteCostPanelProps={
  settings:PricingSettings;
  catalog:BambuFilamentCatalogItem[];
  materialCosts:Record<string,ResolvedMaterialCost>;
  value:QuoteCostInput;
  customerTotalCents:number;
  shippingInternalCostCents:number;
  disabled:boolean;
  onChange:(next:QuoteCostInput)=>void;
  onUseSuggestedPrice:(suggestedTotalCents:number)=>void;
};

export function OwnerQuoteCostPanel({settings,catalog,materialCosts,value,customerTotalCents,shippingInternalCostCents,disabled,onChange,onUseSuggestedPrice}:OwnerQuoteCostPanelProps){
  const families=useMemo(()=>{
    const map=new Map<string,BambuFilamentCatalogItem[]>();
    for(const item of catalog.filter(item=>item.active)){const rows=map.get(item.familyKey)||[];rows.push(item);map.set(item.familyKey,rows);}
    return [...map.entries()].map(([familyKey,items])=>{
      const actual=items.find(item=>materialCosts[item.id]?.source==="actual-average");
      const refill=items.find(item=>item.packageType==="refill");
      const preferred=actual||refill||items[0];
      return {familyKey,label:cleanFamilyName(preferred.displayName),materialClass:preferred.materialClass,preferredId:preferred.id,items};
    }).sort((a,b)=>a.materialClass.localeCompare(b.materialClass)||a.label.localeCompare(b.label));
  },[catalog,materialCosts]);
  const familyByCatalogId=useMemo(()=>{const map=new Map<string,string>();for(const family of families)for(const item of family.items)map.set(item.id,family.familyKey);return map;},[families]);

  function costFor(next:QuoteCostInput){
    const materialTotal=next.materialLines.reduce((sum,line)=>sum+materialCostCents(line.grams,materialCosts[line.catalogItemId]?.costPerGramMicros||0),0);
    const machine=Math.round(next.machineHours*settings.defaultMachineHourlyCostCents);
    const preprocessing=Math.round(next.designHours*settings.defaultDesignHourlyCostCents);
    const legacyLabor=Math.round(next.laborHours*settings.defaultLaborHourlyCostCents);
    const post=Math.round(next.postProcessingHours*settings.defaultPostProcessingHourlyCostCents);
    return materialTotal+machine+preprocessing+legacyLabor+post+next.packagingCostCents+next.localDeliveryInternalCostCents+next.miscellaneousCostCents+shippingInternalCostCents;
  }
  function suggestedFor(next:QuoteCostInput){
    const target=next.targetMarginBasisPoints??settings.targetContributionMarginBasisPoints??2000;
    return suggestedRevenueCents(costFor(next),{...settings,targetContributionMarginBasisPoints:target});
  }
  function commit(next:QuoteCostInput,applyPrice=true){
    onChange(next);
    if(applyPrice){try{onUseSuggestedPrice(suggestedFor(next));}catch{/* settings warning renders below */}}
  }
  function patch(patch:Partial<QuoteCostInput>,applyPrice=true){commit({...value,...patch},applyPrice);}
  function changeLine(index:number,patchLine:Partial<QuoteCostInput["materialLines"][number]>){
    const materialLines=value.materialLines.map((line,i)=>i===index?{...line,...patchLine}:line);commit({...value,materialLines});
  }
  function selectFamily(index:number,familyKey:string){
    const family=families.find(item=>item.familyKey===familyKey);if(!family)return;changeLine(index,{catalogItemId:family.preferredId});
  }
  function addMaterial(){
    const first=families[0];if(!first)return;commit({...value,materialLines:[...value.materialLines,{id:crypto.randomUUID(),catalogItemId:first.preferredId,grams:0}]});
  }

  const calc=useMemo(()=>{
    const materials=value.materialLines.map(line=>{const item=catalog.find(c=>c.id===line.catalogItemId);const cost=materialCosts[line.catalogItemId];const extended=materialCostCents(line.grams,cost?.costPerGramMicros||0);return{line,item,cost,extended};});
    const materialTotal=materials.reduce((sum,row)=>sum+row.extended,0);
    const machineCost=Math.round(value.machineHours*settings.defaultMachineHourlyCostCents);
    const preprocessingCost=Math.round(value.designHours*settings.defaultDesignHourlyCostCents);
    const legacyLaborCost=Math.round(value.laborHours*settings.defaultLaborHourlyCostCents);
    const postProcessingCost=Math.round(value.postProcessingHours*settings.defaultPostProcessingHourlyCostCents);
    const nonPayment=materialTotal+machineCost+preprocessingCost+legacyLaborCost+postProcessingCost+value.packagingCostCents+value.localDeliveryInternalCostCents+value.miscellaneousCostCents+shippingInternalCostCents;
    const target=value.targetMarginBasisPoints??settings.targetContributionMarginBasisPoints??2000;
    const marginSettings={...settings,targetContributionMarginBasisPoints:target};
    const metrics=contributionMetrics(customerTotalCents,nonPayment,marginSettings);
    let suggested=0;let suggestionError="";try{suggested=suggestedRevenueCents(nonPayment,marginSettings);}catch(error){suggestionError=error instanceof Error?error.message:"Pricing target is invalid.";}
    const unpriced=materials.some(row=>row.line.grams>0&&(!row.cost||row.cost.source==="unpriced"));
    return{materials,materialTotal,machineCost,preprocessingCost,legacyLaborCost,postProcessingCost,nonPayment,metrics,suggested,suggestionError,unpriced,target};
  },[value,catalog,materialCosts,settings,customerTotalCents,shippingInternalCostCents]);

  const grouped=Array.from(new Set(families.map(item=>item.materialClass)));
  return <section className="quote-cost-panel quote-cost-panel-primary">
    <div className="quote-cost-heading"><div><span>QUOTE BUILDER · COST &amp; MARGIN</span><strong>Build the quote from actual production inputs.</strong><p>Material, print time, prep, finishing, machine/electricity cost, and payment fees feed the target selling price automatically.</p></div><em>Owner only</em></div>

    <div className="quote-margin-control">
      <div><span>Target contribution margin</span><strong>{(calc.target/100).toFixed(0)}%</strong><small>Base target is 20%. Moving the slider immediately updates the suggested quote price.</small></div>
      <input aria-label="Target contribution margin" type="range" min="5" max="70" step="1" disabled={disabled} value={Math.round(calc.target/100)} onChange={e=>patch({targetMarginBasisPoints:Number(e.target.value)*100})}/>
    </div>

    <div className="quote-cost-materials">
      <div className="quote-cost-section-title"><strong>Filament</strong><button type="button" className="text-button" disabled={disabled||value.materialLines.length>=20||!families.length} onClick={addMaterial}>+ Add filament</button></div>
      {value.materialLines.length===0?<div className="quote-cost-empty">Add the Bambu filament family and estimated grams from the slicer.</div>:value.materialLines.map((line,index)=>{
        const row=calc.materials[index];const familyKey=familyByCatalogId.get(line.catalogItemId)||"";
        return <div className="quote-cost-material-row" key={line.id}>
          <label><span>Bambu filament type</span><select disabled={disabled} value={familyKey} onChange={e=>selectFamily(index,e.target.value)}><option value="">Choose filament</option>{grouped.map(group=><optgroup label={group} key={group}>{families.filter(item=>item.materialClass===group).map(item=><option value={item.familyKey} key={item.familyKey}>{item.label}</option>)}</optgroup>)}</select></label>
          <label><span>Filament grams</span><input type="number" min="0" step="1" disabled={disabled} value={line.grams||""} onChange={e=>changeLine(index,{grams:number(e.target.value)})}/></label>
          <div className="quote-cost-material-meta"><b>{row?.cost?sourceLabel(row.cost.source):"Unpriced"}</b><span>{row?.cost?.costPerGramMicros?`${money(row.cost.costPerGramMicros/1_000_000*1000)} / kg`:"No cost basis"}</span><strong>{money(row?.extended||0)}</strong></div>
          <button type="button" className="text-button danger-text" disabled={disabled} onClick={()=>commit({...value,materialLines:value.materialLines.filter((_,i)=>i!==index)})}>Remove</button>
        </div>;
      })}
      <small className="quote-cost-family-note">Spool/refill packaging is intentionally hidden here. The calculator uses the best available cost basis for the selected Bambu material family, preferring imported purchase history when available.</small>
    </div>

    <div className="quote-production-inputs">
      <label><span>Print time / machine hours</span><input type="number" min="0" step="0.1" disabled={disabled} value={value.machineHours||""} onChange={e=>patch({machineHours:number(e.target.value)})}/><small>Includes the configured printer + electricity cost per machine hour.</small></label>
      <label><span>Pre-processing hours</span><input type="number" min="0" step="0.1" disabled={disabled} value={value.designHours||""} onChange={e=>patch({designHours:number(e.target.value)})}/><small>Designing, model repair, painting in the slicer, slicing, setup, and preparation.</small></label>
      <label><span>Post-processing hours</span><input type="number" min="0" step="0.1" disabled={disabled} value={value.postProcessingHours||""} onChange={e=>patch({postProcessingHours:number(e.target.value)})}/><small>Support removal, cleanup, assembly, finishing, and final preparation.</small></label>
    </div>

    <details className="quote-cost-advanced"><summary>Additional internal costs</summary><div className="quote-cost-input-grid"><label><span>Packaging ($)</span><input inputMode="decimal" disabled={disabled} value={dollars(value.packagingCostCents)} onChange={e=>patch({packagingCostCents:Math.round(number(e.target.value)*100)})}/></label><label><span>Internal delivery cost ($)</span><input inputMode="decimal" disabled={disabled} value={dollars(value.localDeliveryInternalCostCents)} onChange={e=>patch({localDeliveryInternalCostCents:Math.round(number(e.target.value)*100)})}/></label><label><span>Miscellaneous cost ($)</span><input inputMode="decimal" disabled={disabled} value={dollars(value.miscellaneousCostCents)} onChange={e=>patch({miscellaneousCostCents:Math.round(number(e.target.value)*100)})}/></label>{value.laborHours>0&&<label><span>Legacy labor hours</span><input type="number" min="0" step="0.1" disabled={disabled} value={value.laborHours} onChange={e=>patch({laborHours:number(e.target.value)})}/></label>}</div></details>

    {calc.unpriced&&<div className="quote-cost-warning">One or more selected filaments have no cost basis. Margin is incomplete until an invoice, Bambu MSRP, or manual fallback cost is available.</div>}
    <div className="quote-cost-summary quote-cost-summary-primary">
      <div><span>Material</span><strong>{money(calc.materialTotal)}</strong></div>
      <div><span>Printer + electricity</span><strong>{money(calc.machineCost)}</strong></div>
      <div><span>Pre-processing</span><strong>{money(calc.preprocessingCost)}</strong></div>
      <div><span>Post-processing</span><strong>{money(calc.postProcessingCost)}</strong></div>
      <div><span>Direct cost before payment fee</span><strong>{money(calc.nonPayment)}</strong></div>
      <div><span>Estimated payment fee</span><strong>{money(calc.metrics.paymentFeeCents)}</strong></div>
      <div className="quote-cost-suggested"><span>Target quote at {(calc.target/100).toFixed(0)}% margin</span><strong>{calc.unpriced||calc.suggestionError?"Incomplete":money(calc.suggested)}</strong></div>
      <div className={!calc.unpriced&&calc.metrics.contributionProfitCents<0?"is-negative":""}><span>Current expected profit</span><strong>{calc.unpriced?"Incomplete":money(calc.metrics.contributionProfitCents)}</strong></div>
      <div><span>Current contribution margin</span><strong>{calc.unpriced?"Incomplete":`${(calc.metrics.contributionMarginBasisPoints/100).toFixed(1)}%`}</strong></div>
    </div>
    {calc.suggestionError&&<div className="quote-cost-warning">{calc.suggestionError}</div>}
    {!calc.unpriced&&!calc.suggestionError&&<button className="button button-small quote-apply-price" type="button" disabled={disabled} onClick={()=>onUseSuggestedPrice(calc.suggested)}>Apply {money(calc.suggested)} Target Price</button>}
  </section>;
}

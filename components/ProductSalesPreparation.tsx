'use client';
import {useState} from 'react';
import Image from 'next/image';
import type {ProductProject} from '@/lib/ai-center/projects';
import type {Job} from '@/lib/ai-center/types';
import {calculatePricing,type SalesInput} from '@/lib/ai-center/sales';
import styles from './AiBusinessCenter.module.css';

type Props={project:ProductProject;jobs:Job[];busy:boolean;command:(value:unknown)=>Promise<boolean>};
const usd=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const fields=[['materialCents','Material per print'],['printerCentsPerHour','Printer operation and wear per hour'],['packagingCents','Packaging per order'],['handlingCents','Handling labor per order'],['postageCents','Postage per order'],['shippingChargedCents','Shipping charged to buyer'],['orderOverheadCents','Other allocated costs per order'],['digitalSupportCents','Digital support cost per order'],['paymentTaxCents','Buyer tax amount subject to payment fees']] as const;
function initial(project:ProductProject):SalesInput{
 const test=project.revisions.at(-1)?.tests.at(-1),material=test?.notes.match(/material cost \$(\d+(?:\.\d+)?)/i);
 return project.sales||{materialCents:material?Math.round(Number(material[1])*100):null,printMinutes:test?.minutes??null,printerCentsPerHour:null,failureBps:null,packagingCents:null,handlingCents:null,postageCents:null,shippingChargedCents:null,orderOverheadCents:null,digitalSupportCents:null,paymentTaxCents:null,targetMarginBps:4000,minContributionCents:300,costSource:'Owner estimates; confirm costs, material grade, shipping and fees before approval.',fees:{website:null,etsy:null},comparables:[]};
}
export function ProductSalesPreparation({project:p,jobs,busy,command}:Props){
 const [draft,setDraft]=useState<SalesInput>(()=>initial(p)),[includeImage,setIncludeImage]=useState(false),[query,setQuery]=useState('small 3d printed desk tray');
 const prices=p.sales?calculatePricing(p.sales):null,passed=p.revisions.at(-1)?.tests.at(-1)?.passed;
 const releaseFloors=p.sales?calculatePricing({...p.sales,shippingChargedCents:0}):null;
 const savedVersion=p.version;
 const dirty=JSON.stringify(draft)!==JSON.stringify(initial(p));
 const save=()=>command({action:'project',id:p.id,version:savedVersion,change:{action:'sales',input:draft}});
 const saleJobs=jobs.filter(j=>j.projectId===p.id&&['pricing','image'].includes(j.kind));
 return <details className={styles.approval} open><summary>Prepare product for sale · prices, visuals & listing drafts</summary>
  <p>AI proposes a price experiment and listing copy. The calculator protects your selected contribution floor. Confirm estimated costs once; missing amounts remain unknown. Public listings and price changes still require separate approval.</p>
  <details><summary>Costs & channel fees</summary><form onSubmit={e=>{e.preventDefault();void save();}}>
   <p>Enter USD estimates; explicitly enter zero when a cost does not apply. These are proposed estimates, not proof of net profit. Defaults of 40% contribution margin and $3 contribution per order are adjustable.</p>
   <div className={styles.grid}>{fields.map(([key,label])=><label key={key}>{label} (USD)<input type="number" min="0" max="10000" step="0.01" value={draft[key]===null?'':draft[key]!/100} onChange={e=>setDraft({...draft,[key]:e.target.value===''?null:Math.round(Number(e.target.value)*100)})}/></label>)}</div>
   <label>Print minutes per unit (estimate allowed)<input type="number" min="0.01" max="10000" step="0.01" value={draft.printMinutes??''} onChange={e=>setDraft({...draft,printMinutes:e.target.value===''?null:Number(e.target.value)})}/></label>
   <label>Failed print allowance (%)<input type="number" min="0" max="50" step="0.01" value={draft.failureBps===null?'':draft.failureBps/100} onChange={e=>setDraft({...draft,failureBps:e.target.value===''?null:Math.round(Number(e.target.value)*100)})}/></label>
   <label>Target contribution margin (%)<input required type="number" min="0" max="80" step="0.01" value={draft.targetMarginBps/100} onChange={e=>setDraft({...draft,targetMarginBps:Math.round(Number(e.target.value)*100)})}/></label>
   <label>Minimum contribution per order (USD)<input required type="number" min="0" max="10000" step="0.01" value={draft.minContributionCents/100} onChange={e=>setDraft({...draft,minContributionCents:Math.round(Number(e.target.value)*100)})}/></label>
   <label>Cost sources / assumptions<textarea required maxLength={500} value={draft.costSource} onChange={e=>setDraft({...draft,costSource:e.target.value})}/></label>
   {(['website','etsy'] as const).map(channel=><fieldset key={channel}><legend>{channel==='etsy'?'Etsy':'Website'} fee profile</legend><p>Confirm your actual account rates, listing renewals, advertising and tax treatment. No fee profile is assumed.</p>
    <label className={styles.check}><input type="checkbox" checked={Boolean(draft.fees[channel])} onChange={e=>setDraft({...draft,fees:{...draft.fees,[channel]:e.target.checked?{percentBps:0,fixedCents:0,listingCents:0,adBps:0}:null}})}/>Configure this channel’s estimated fees</label>
    {draft.fees[channel]&&(['percentBps','adBps','fixedCents','listingCents'] as const).map(key=><label key={key}>{key==='percentBps'?'Combined transaction/payment percentage (%)':key==='adBps'?'Additional advertising fee (%)':key==='fixedCents'?'Fixed payment fee per order (USD)':'Listing/renewal fee per sold bundle (USD)'}<input type="number" required min="0" max={key.endsWith('Bps')?50:10000} step="0.01" value={draft.fees[channel]![key]/100} onChange={e=>setDraft({...draft,fees:{...draft.fees,[channel]:{...draft.fees[channel]!,[key]:Math.round(Number(e.target.value)*100)}}})}/></label>)}
   </fieldset>)}
   <button disabled={busy}>Save cost estimates and fee profiles</button>
  </form></details>
  <details><summary>Comparable asking prices · {draft.comparables.length}</summary><p>Collect official Etsy observations when the approved app is connected. Search results do not establish size, variant, shipping, bundle quantity or sales. Review these facts before marking a match. Unconfirmed, duplicate, non-USD and older-than-30-day observations do not enter the price median.</p>
   <form onSubmit={e=>{e.preventDefault();void command({action:'saleResearch',id:p.id,version:p.version,query});}}><label>Market research phrase<input required maxLength={120} value={query} onChange={e=>setQuery(e.target.value)}/></label><button disabled={busy||!p.sales||dirty}>Collect Etsy price observations</button><p>Save costs first. Collection replaces this project’s comparable sample and invalidates earlier sale drafts; no listing is changed.</p></form>
   {draft.comparables.map((c,index)=><fieldset key={index}><legend><a href={c.url} target="_blank" rel="noopener noreferrer">{c.label}</a></legend><p>{(c.priceCents/100).toFixed(2)} {c.currency} · observed {new Date(c.observedAt).toLocaleDateString()} · shipping {c.shippingCents===null?'unknown':(c.shippingCents/100).toFixed(2)+' '+c.currency}</p>
    <label>Product format<select value={c.format} onChange={e=>setDraft({...draft,comparables:draft.comparables.map((v,i)=>i===index?{...v,format:e.target.value as typeof c.format}:v)})}><option value="unknown">Unknown</option><option value="physical">Physical print</option><option value="digital">Digital STL</option></select></label>
    <label>Units included in the listed price<input type="number" min="1" max="100" value={c.quantity??''} onChange={e=>setDraft({...draft,comparables:draft.comparables.map((v,i)=>i===index?{...v,quantity:e.target.value===''?null:Number(e.target.value)}:v)})}/></label>
    <label className={styles.check}><input type="checkbox" checked={c.matchConfirmed} onChange={e=>setDraft({...draft,comparables:draft.comparables.map((v,i)=>i===index?{...v,matchConfirmed:e.target.checked}:v)})}/>Reviewed comparable size, function, variant price and bundle quantity</label>
   </fieldset>)}
   <details><summary>Add a sourced comparable manually</summary><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setDraft({...draft,comparables:[...draft.comparables,{label:String(f.get('label')),url:String(f.get('url')),observedAt:new Date(String(f.get('date'))+'T00:00:00Z').toISOString(),format:'unknown',quantity:null,priceCents:Math.round(Number(f.get('price'))*100),currency:'USD',shippingCents:null,matchConfirmed:false}]});e.currentTarget.reset();}}><label>Comparable name<input name="label" required maxLength={120}/></label><label>HTTPS source<input name="url" required type="url" maxLength={1000}/></label><label>Observed date<input name="date" required type="date"/></label><label>Observed asking price (USD)<input name="price" required type="number" min="0" max="10000" step="0.01"/></label><button disabled={busy||draft.comparables.length>=25}>Add to unsaved sample</button></form></details>
   <button disabled={busy} onClick={()=>void save()}>Save reviewed sample and costs</button>
  </details>
  {prices&&<><h4>Calculated price experiments</h4>{prices.missing.length?<p>Missing or invalid: {prices.missing.join(', ')}. Recommendations are blocked.</p>:<div className={styles.tableWrap}><table><thead><tr><th>Channel / product</th><th>Item price</th><th>Shipping</th><th>Release floor without shipping income</th><th>Estimated contribution</th><th>Evidence</th></tr></thead><tbody>{prices.options.map(o=><tr key={`${o.channel}-${o.format}-${o.quantity}`}><td>{o.channel} · {o.format==='digital'?'STL file':`${o.quantity} print${o.quantity>1?'s':''}`}</td><td>{usd(o.priceCents)}</td><td>{usd(o.shippingChargedCents)}</td><td>{usd(releaseFloors?.options.find(r=>r.channel===o.channel&&r.format===o.format&&r.quantity===o.quantity)?.minimumPriceCents??0)}</td><td>{usd(o.contributionCents)} · {(o.marginBps/100).toFixed(1)}%</td><td>{o.marketSampleCount} confirmed matches · {o.basis}</td></tr>)}</tbody></table></div>}<p>{prices.limitations}</p></>}
  <label className={styles.check}><input type="checkbox" checked={includeImage} onChange={e=>setIncludeImage(e.target.checked)}/>Also queue one paid AI concept image (requires enabled image provider and separate spending approval)</label>
  {dirty&&<p>Save your changed costs or comparable sample before queuing a draft.</p>}
  <button disabled={busy||!passed||!p.sales||dirty} onClick={()=>void command({action:'prepareSale',id:p.id,version:p.version,includeImage})}>AI: prepare prices and listing draft</button>
  {!passed&&<p>Print and pass the current revision before sale preparation.</p>}
  <p>Generated images are private concept previews, not verified product photography. Supply an original photo of the physical print for Etsy. No background task uploads images or publishes.</p>
  {saleJobs.map(j=><div key={j.id} className={styles.approval}><strong>{j.kind==='image'?'Visual agent':'Pricing agent'} · {j.status}{j.projectVersion!==p.version?' · outdated project version':''}</strong>{j.output&&<pre>{j.output}</pre>}{j.artifactId&&<><Image unoptimized src={`/api/owner/business/assets?id=${j.artifactId}`} alt="AI concept preview; geometry and color require owner verification" width={1024} height={1024} className={styles.draftImage}/><p><a href={`/api/owner/business/assets?id=${j.artifactId}`}>Download private concept image</a></p></>}<p>Spending and completed drafts appear in the approvals inbox.</p></div>)}
 </details>;
}

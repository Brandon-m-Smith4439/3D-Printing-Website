"use client";
import { useState } from "react";
import type { ShippingSelection } from "@/lib/quote-types";

type Rate={id:string;carrier:"USPS"|"UPS"|"FedEx";service:string;rateCents:number;deliveryDays:number|null;deliveryDate:string};
type Address={name:string;street1:string;street2:string;city:string;state:string;zip:string;country:string};
type AddressErrors=Partial<Record<keyof Address,string>>;
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
async function jsonFetch(url:string,init:RequestInit){const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...init,signal:controller.signal});}finally{window.clearTimeout(timer);}}
function stateValue(value:string){return value.replace(/[^A-Za-z]/g,"").slice(0,2).toUpperCase();}
function zipValue(value:string){const digits=value.replace(/\D/g,"").slice(0,9);return digits.length>5?`${digits.slice(0,5)}-${digits.slice(5)}`:digits;}
function clientErrors(address:Address):AddressErrors{
  const errors:AddressErrors={};
  if(address.name.trim().length<1)errors.name="Enter the recipient name.";
  if(address.street1.trim().length<3)errors.street1="Enter the street address.";
  if(address.city.trim().length<2)errors.city="Enter the city.";
  if(!/^[A-Z]{2}$/.test(address.state))errors.state="Use the 2-letter state code, such as NC.";
  if(!/^\d{5}(?:-\d{4})?$/.test(address.zip))errors.zip="Use a 5-digit ZIP code or ZIP+4.";
  return errors;
}
export function CustomerShippingSelector({quoteId,existing,customerName,onChanged,onMessage}:{quoteId:string;existing:ShippingSelection|null;customerName:string;onChanged:()=>Promise<void>;onMessage:(message:string)=>void}){
  const [open,setOpen]=useState(!existing);const [busy,setBusy]=useState(false);const [rates,setRates]=useState<Rate[]>([]);const [shipmentId,setShipmentId]=useState("");
  const [address,setAddress]=useState<Address>(existing?.address||{name:customerName,street1:"",street2:"",city:"",state:"",zip:"",country:"US"});
  const [fieldErrors,setFieldErrors]=useState<AddressErrors>({});
  function update(key:keyof Address,value:string){
    const next=key==="state"?stateValue(value):key==="zip"?zipValue(value):value;
    setAddress(current=>({...current,[key]:next}));
    setFieldErrors(current=>{const copy={...current};delete copy[key];return copy;});
    setRates([]);setShipmentId("");
  }
  async function getRates(){
    const local=clientErrors(address);setFieldErrors(local);
    if(Object.keys(local).length){onMessage("Please correct the highlighted shipping address fields.");return;}
    setBusy(true);onMessage("");
    try{
      const r=await jsonFetch(`/api/account/quotes/${quoteId}/shipping-rates`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(address)});
      const j=await r.json() as {shipmentId?:string;rates?:Rate[];message?:string;fieldErrors?:Record<string,string[]>};
      if(j.fieldErrors){const next:AddressErrors={};for(const [field,errors] of Object.entries(j.fieldErrors)){if(errors?.[0])next[field as keyof Address]=errors[0];}setFieldErrors(next);}
      if(!r.ok||!j.shipmentId)throw new Error(j.message||"Could not calculate live rates.");
      setShipmentId(j.shipmentId);setRates(j.rates||[]);onMessage("Live carrier rates loaded. Choose the service you want to use.");
    }catch(e){
      if(e instanceof Error&&e.name==="AbortError")onMessage("The carrier-rate service took too long to respond. Please try again.");
      else onMessage(e instanceof Error?e.message:"Could not calculate live rates.");
    }finally{setBusy(false);}
  }
  async function select(rate:Rate){setBusy(true);onMessage("");try{const r=await jsonFetch(`/api/account/quotes/${quoteId}/shipping-selection`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({selection:{shipmentId,rateId:rate.id},address})});const j=await r.json() as {message?:string};if(!r.ok)throw new Error(j.message||"Could not save shipping choice.");onMessage(j.message||"Shipping selected.");setOpen(false);setRates([]);await onChanged();}catch(e){onMessage(e instanceof Error?e.message:"Could not save shipping choice.");}finally{setBusy(false);}}
  const grouped=rates.reduce<Record<string,Rate[]>>((acc,rate)=>{(acc[rate.carrier]||=[]).push(rate);return acc;},{});
  function cls(key:keyof Address,extra=""){return `${fieldErrors[key]?"shipping-address-field-invalid":""} ${extra}`.trim();}
  return <div className="customer-shipping-selector">
    <div className="customer-shipping-heading"><div><strong>Shipping carrier & service</strong><span>Enter the delivery address, then compare live USPS, UPS, and FedEx rates.</span></div>{existing&&!open&&<button className="button button-secondary button-small" type="button" onClick={()=>setOpen(true)}>Change Shipping</button>}</div>
    {existing&&!open&&<div className="shipping-selected-card"><div><b>{existing.carrier}</b><strong>{existing.service}</strong><span>{existing.deliveryDays?`${existing.deliveryDays} business day${existing.deliveryDays===1?"":"s"}`:existing.deliveryDate?`Estimated ${existing.deliveryDate}`:"Carrier estimate shown at checkout"}</span></div><strong>{money(existing.rateCents)}</strong></div>}
    {open&&<>
      <div className="shipping-address-card">
        <div className="shipping-address-card-heading"><div><strong>Delivery address</strong><span>US addresses only for the current live-rate workflow.</span></div><span className="shipping-country-badge">US</span></div>
        <div className="shipping-address-grid">
          <label className={cls("name")}><span>Recipient name *</span><input value={address.name} autoComplete="name" maxLength={120} onChange={e=>update("name",e.target.value)} placeholder="Full name"/>{fieldErrors.name&&<small>{fieldErrors.name}</small>}</label>
          <label className={cls("street1","wide")}><span>Street address *</span><input value={address.street1} autoComplete="address-line1" maxLength={120} onChange={e=>update("street1",e.target.value)} placeholder="123 Main St"/>{fieldErrors.street1&&<small>{fieldErrors.street1}</small>}</label>
          <label className={cls("street2")}><span>Apt / suite <em>Optional</em></span><input value={address.street2} autoComplete="address-line2" maxLength={120} onChange={e=>update("street2",e.target.value)} placeholder="Apt 4B"/></label>
          <label className={cls("city")}><span>City *</span><input value={address.city} autoComplete="address-level2" maxLength={80} onChange={e=>update("city",e.target.value)} placeholder="Charlotte"/>{fieldErrors.city&&<small>{fieldErrors.city}</small>}</label>
          <label className={cls("state")}><span>State *</span><input value={address.state} autoComplete="address-level1" inputMode="text" maxLength={2} onChange={e=>update("state",e.target.value)} placeholder="NC"/>{fieldErrors.state&&<small>{fieldErrors.state}</small>}</label>
          <label className={cls("zip")}><span>ZIP code *</span><input value={address.zip} autoComplete="postal-code" inputMode="numeric" maxLength={10} onChange={e=>update("zip",e.target.value)} placeholder="28110"/>{fieldErrors.zip&&<small>{fieldErrors.zip}</small>}</label>
        </div>
      </div>
      <div className="shipping-rate-actions"><button className={`button button-small ${busy?"is-loading":""}`} disabled={busy} type="button" onClick={()=>void getRates()}>{busy?"Getting live rates…":rates.length?"Refresh Live Rates":"Get Live Rates"}</button>{existing&&<button className="button button-cancel button-small" disabled={busy} type="button" onClick={()=>setOpen(false)}>Cancel</button>}</div>
      {rates.length>0&&<div className="shipping-rate-groups">{["USPS","UPS","FedEx"].map(carrier=>grouped[carrier]?.length?<section key={carrier}><div className="shipping-carrier-heading"><strong>{carrier}</strong><span>{grouped[carrier].length} option{grouped[carrier].length===1?"":"s"}</span></div><div className="shipping-rate-list">{grouped[carrier].map(rate=><button type="button" disabled={busy} onClick={()=>void select(rate)} key={rate.id}><div><strong>{rate.service}</strong><span>{rate.deliveryDays?`Estimated ${rate.deliveryDays} business day${rate.deliveryDays===1?"":"s"}`:rate.deliveryDate?`Estimated ${rate.deliveryDate}`:"Delivery estimate unavailable"}</span></div><b>{money(rate.rateCents)}</b></button>)}</div></section>:null)}</div>}
    </>}
    <small className="shipping-private-note">Your delivery address is private account/order information. It is never shown on the public Queue.</small>
  </div>;
}

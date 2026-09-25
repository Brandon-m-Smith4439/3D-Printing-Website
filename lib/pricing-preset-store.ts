import 'server-only';
import { randomUUID } from 'node:crypto';
import { readCollection, writeCollection } from './database.ts';
import type { PricingPreset } from './pricing-types.ts';
import { sanitizePricingPreset } from './quote-reuse.ts';

const COLLECTION='pricing-presets';
let chain=Promise.resolve();
function mutate<T>(fn:()=>Promise<T>){const next=chain.then(fn,fn);chain=next.then(()=>undefined,()=>undefined);return next;}
export async function readPricingPresets(){return (await readCollection<PricingPreset>(COLLECTION)).sort((a,b)=>a.name.localeCompare(b.name));}
export function createPricingPreset(input:PricingPreset){return mutate(async()=>{const items=await readPricingPresets();const now=new Date().toISOString();const clean=sanitizePricingPreset(input);if(!clean.name)throw new Error('Preset name is required.');const record={...clean,id:randomUUID(),createdAt:now,updatedAt:now};items.push(record);await writeCollection(COLLECTION,items);return record;});}
export function updatePricingPreset(id:string,input:PricingPreset){return mutate(async()=>{const items=await readPricingPresets();const index=items.findIndex(item=>item.id===id);if(index<0)throw new Error('Pricing preset not found.');const clean=sanitizePricingPreset(input);if(!clean.name)throw new Error('Preset name is required.');const record={...clean,id,createdAt:items[index].createdAt,updatedAt:new Date().toISOString()};items[index]=record;await writeCollection(COLLECTION,items);return record;});}
export function deletePricingPreset(id:string){return mutate(async()=>{const items=await readPricingPresets();if(!items.some(item=>item.id===id))throw new Error('Pricing preset not found.');await writeCollection(COLLECTION,items.filter(item=>item.id!==id));});}

import { runCustomerFollowUpSweep } from "./customer-follow-up-engine.ts";
const key=Symbol.for("meshharbor.customerFollowUpScheduler");
function clampInterval(raw:string|undefined){ const n=Number(raw||60); return Number.isFinite(n)?Math.max(15,Math.min(1440,Math.round(n))):60; }
async function safeSweep(){ try{ await runCustomerFollowUpSweep(); }catch(error){ console.error("Customer follow-up sweep failed",error instanceof Error?error.message:"unknown error"); } }
export function startCustomerFollowUpScheduler(){ const g=globalThis as typeof globalThis & {[key]:boolean|undefined}; if(g[key])return; g[key]=true; const first=setTimeout(()=>void safeSweep(),60_000); first.unref?.(); const interval=setInterval(()=>void safeSweep(),clampInterval(process.env.CUSTOMER_FOLLOWUPS_INTERVAL_MINUTES)*60_000); interval.unref?.(); }

import 'server-only';
import {MarketplaceStore} from './store.ts';
import {connectionConfiguration,observeMarket} from './etsy.ts';

// Root worker can call this once per cycle. A committed lease records lastAttempt
// before I/O; daily attempts include failures, so crashes never trigger a retry storm.
// One fixed 25-result page per day, rotating owner-configured keywords. No paid tool.
export async function runMarketplaceResearch(fetcher:typeof fetch=fetch,now=Date.now()){
 if(process.env.ETSY_RESEARCH_ENABLED!=='true')return null;
 const configuration=connectionConfiguration();if(!configuration.enabled||configuration.missing.length)return null;
 const keywords=(process.env.ETSY_RESEARCH_KEYWORDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!keywords.length||keywords.length>10||keywords.some(s=>s.length>120))throw Error('Configure 1–10 Etsy research phrases, each at most 120 characters.');
 const store=new MarketplaceStore();let lease:string|undefined;
 try{try{lease=store.lease('daily-research',now,86400000,86400000);}catch{return null;}
  const query=keywords[Math.floor(now/86400000)%keywords.length];
  try{return await observeMarket(store,query,fetcher,now);}catch{const report={kind:'research-failure' as const,query,observedAt:new Date(now).toISOString(),message:'Scheduled Etsy observation unavailable. Check app configuration and rate limits. No retry before the next daily attempt.'};store.record(report,now);return report;}
 }finally{if(lease)store.release('daily-research',lease);store.close();}
}

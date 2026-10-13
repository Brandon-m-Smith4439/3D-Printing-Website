import 'server-only';
import type {CenterStore} from './store.ts';
import {MarketplaceStore} from '../marketplace/store.ts';
import {observeMarket} from '../marketplace/etsy.ts';

// Reuse the official Etsy connector and its rate-limited read lease. No scraping,
// new credentials, paid search provider or publication access is introduced.
export async function gatherSaleResearch(center:CenterStore,id:string,version:number,query:string,fetcher:typeof fetch=fetch,now=Date.now()){
 const project=center.product(id,version);
 if(!project.sales)throw Error('Save cost estimates before collecting price research.');
 const market=new MarketplaceStore();
 try{
  const report=await observeMarket(market,query,fetcher,now);
  const comparables=report.items.map(item=>({label:item.title.slice(0,120)||`Etsy listing ${item.id}`,url:item.url,observedAt:report.observedAt,format:'unknown' as const,quantity:null,priceCents:item.priceCents,currency:item.currency,shippingCents:null,matchConfirmed:false}));
  // The search payload does not prove size, variant, bundle or digital format.
  // Preserve those unknowns for agent/owner review instead of guessing matches.
  return center.updateProject(id,version,{action:'sales',input:{...project.sales,comparables}});
 }finally{market.close();}
}

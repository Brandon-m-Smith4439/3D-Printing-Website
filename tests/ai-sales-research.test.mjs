import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'sales-research-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'ai.sqlite');process.env.MARKETPLACE_DATABASE_PATH=path.join(dir,'market.sqlite');process.env.ETSY_ENABLED='true';process.env.ETSY_APP_KEY='fixture-key';process.env.ETSY_SHARED_SECRET='fixture-secret';process.env.MARKETPLACE_TOKEN_KEY='a'.repeat(64);process.env.ETSY_REDIRECT_URI='https://example.test/api/owner/marketplace/callback';process.env.NEXT_PUBLIC_SITE_URL='https://example.test';
const {CenterStore}=await import('../lib/ai-center/store.ts');const {gatherSaleResearch}=await import('../lib/ai-center/sales-research.ts');const {calculatePricing}=await import('../lib/ai-center/sales.ts');
const center=new CenterStore();
try{
 let p=center.createProject({business:'mesh',name:'Tray',brief:'Original tray'});
 p=center.updateProject(p.id,p.version,{action:'sales',input:{costSource:'Unknown fixture costs',fees:{website:null,etsy:null}}});
 let calls=0;
 const result=await gatherSaleResearch(center,p.id,p.version,'small desk tray',async(url,options)=>{calls++;assert.match(url,/api.etsy.com\/v3\/application\/listings\/active/);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new Response(JSON.stringify({count:1,results:[{listing_id:123,title:'Tray',price:{amount:900,divisor:100,currency_code:'USD'}}]}));});
 assert.equal(calls,1);assert.equal(result.sales.comparables[0].priceCents,900);assert.equal(result.sales.comparables[0].format,'unknown');assert.equal(result.sales.comparables[0].matchConfirmed,false);assert.equal(result.sales.comparables[0].quantity,null);assert.ok(calculatePricing(result.sales).missing.length);
 await assert.rejects(()=>gatherSaleResearch(center,p.id,p.version,'stale',async()=>{throw Error('Must not run');}),/changed/);
 process.env.ETSY_ENABLED='false';await assert.rejects(()=>gatherSaleResearch(center,result.id,result.version,'small tray',async()=>{throw Error('Must not run');}),/disabled/);assert.equal(calls,1);
 console.log('Official read-only Etsy research preserves unknown format, quantity, shipping and demand.');
}finally{center.close();rmSync(dir,{recursive:true,force:true});}

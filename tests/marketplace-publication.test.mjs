import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=mkdtempSync(path.join(tmpdir(),'etsy-write-fixtures-'));
process.env.MARKETPLACE_DATABASE_PATH=path.join(dir,'market.sqlite');process.env.MARKETPLACE_TOKEN_KEY='cd'.repeat(32);
process.env.ETSY_APP_KEY='fixture-app';process.env.ETSY_SHARED_SECRET='fixture-secret';process.env.ETSY_ENABLED='true';process.env.ETSY_REDIRECT_URI='https://owner.example/api/owner/marketplace/callback';
const {MarketplaceStore}=await import('../lib/marketplace/store.ts');
const {PublicationStore,preparePublication,executePublication}=await import('../lib/marketplace/publication.ts');
const {beginAuthorization,completeAuthorization}=await import('../lib/marketplace/etsy.ts');
const store=new MarketplaceStore(),pub=new PublicationStore();
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGucAAAAASUVORK5CYII=','base64');
const asset=Buffer.from('solid tested-stl');
const project={id:'p',version:3,stage:'release',name:'Original stand',revisions:[{id:'r',filename:'stand.stl',sha256:createHash('sha256').update(asset).digest('hex'),tests:[{passed:true}]}],release:{revisionId:'r',description:'Original physically tested stand.',physicalPriceCents:2000,digitalPriceCents:500,costCents:400,stock:2,license:'Personal use STL license',original:true}};
const jobs=[{projectId:'p',key:'project-p-3-listing',kind:'listing',status:'ready',output:'Reviewed listing description'}];
const args={format:'physical',title:'Original stand',description:'Original physically tested stand.',priceCents:2000,allocatedQuantity:1,taxonomyId:10,shippingProfileId:20,readinessStateId:30,returnPolicyId:40,whenMade:'2020_2026',originalPhoto:true,stockAllocated:true,rightsReviewed:true,policiesReviewed:true};
try{
 store.saveToken({accessToken:'123.writeFixtureSecret',refreshToken:'123.refreshFixtureSecret',expiresAt:Date.now()+3600000,scopes:['shops_r','listings_r','transactions_r','listings_w'],shopId:456,userId:123,shopName:'MeshHarbor3D'});
 const intent=preparePublication(pub,store,project,jobs,args,photo,'photo.png',asset);
 assert.equal(intent.status,'preview');assert.equal(intent.package.quantity,1);assert.ok(intent.hash);assert.equal(intent.package.shouldAutoRenew,false);
 assert.equal(preparePublication(pub,store,project,jobs,args,photo,'photo.png',asset).id,intent.id);
 await assert.rejects(()=>executePublication(pub,store,intent.id,intent.hash,project,jobs,{publish:true,fees:true,stock:true},async()=>{throw Error('never call disabled');}),/disabled/);
 process.env.ETSY_WRITES_ENABLED='true';
 await assert.rejects(()=>executePublication(pub,store,intent.id,'wrong',project,jobs,{publish:true,fees:true,stock:true},async()=>{throw Error('never call changed');}),/changed/);
 await assert.rejects(()=>executePublication(pub,store,intent.id,intent.hash,project,jobs,{publish:true,fees:false,stock:true},async()=>{throw Error('never call without fee approval');}),/approval/);
 await assert.rejects(()=>executePublication(pub,store,intent.id,intent.hash,{...project,version:4},jobs,{publish:true,fees:true,stock:true},async()=>{throw Error('never call stale');}),/changed/);
 let calls=0;
 const fetcher=async(url,options)=>{
  assert.equal(new URL(url).host,'api.etsy.com');assert.equal(options.redirect,'error');calls++;
  if(options.method==='GET')return Response.json({shop_id:456,user_id:123,shop_name:'MeshHarbor3D',currency_code:'USD'});
  if(url.endsWith('/listings')){const body=new URLSearchParams(options.body);assert.equal(body.get('quantity'),'1');assert.equal(body.get('should_auto_renew'),'false');assert.equal(body.get('price'),'20.00');return Response.json({listing_id:1001,state:'draft'});}
  if(url.endsWith('/images')){assert.ok(options.body instanceof FormData);assert.equal(options.body.get('image').size,photo.length);return Response.json({listing_image_id:2002});}
  assert.equal(options.method,'PATCH');assert.equal(new URLSearchParams(options.body).get('state'),'active');return Response.json({listing_id:1001,state:'active'});
 };
 const published=await executePublication(pub,store,intent.id,intent.hash,project,jobs,{publish:true,fees:true,stock:true},fetcher);
 assert.equal(published.status,'published');assert.equal(published.listingId,1001);assert.equal(calls,4);
 await assert.rejects(()=>executePublication(pub,store,intent.id,intent.hash,project,jobs,{publish:true,fees:true,stock:true},fetcher),/already|pending/);assert.equal(calls,4);
 assert.throws(()=>preparePublication(pub,store,project,jobs,{...args,allocatedQuantity:2},photo,'photo.png',asset));
 assert.throws(()=>preparePublication(pub,store,{...project,release:{...project.release,original:false}},jobs,args,photo,'photo.png',asset),/original/i);
 assert.throws(()=>preparePublication(pub,store,project,jobs,args,Buffer.from('<svg/>'),'photo.svg',asset),/photo/);
 const digital=preparePublication(pub,store,project,jobs,{...args,format:'digital',priceCents:500,shippingProfileId:null,readinessStateId:null,returnPolicyId:null},photo,'photo.png',asset);
 let writes=0;const broken=await executePublication(pub,store,digital.id,digital.hash,project,jobs,{publish:true,fees:true,stock:true},async(url,options)=>{if(options.method==='GET')return Response.json({shop_id:456,user_id:123,shop_name:'MeshHarbor3D',currency_code:'USD'});writes++;if(url.endsWith('/listings'))return Response.json({listing_id:3003,state:'draft'});throw Error('raw upstream token secret');});
 assert.equal(broken.status,'uncertain');assert.equal(broken.listingId,3003);assert.equal(writes,2);assert.ok(!JSON.stringify(pub.list()).includes('raw upstream'));
 await assert.rejects(()=>executePublication(pub,store,digital.id,digital.hash,project,jobs,{publish:true,fees:true,stock:true},fetcher),/already|pending/);
 const nextProject={...project,version:4},nextJobs=[{...jobs[0],key:'project-p-4-listing'}];
 const digitalGood=preparePublication(pub,store,nextProject,nextJobs,{...args,format:'digital',priceCents:500,shippingProfileId:null,readinessStateId:null,returnPolicyId:null},photo,'photo.png',asset);
 let fileCalls=0;const downloaded=await executePublication(pub,store,digitalGood.id,digitalGood.hash,nextProject,nextJobs,{publish:true,fees:true,stock:true},async(url,options)=>{
  if(options.method==='GET')return Response.json({shop_id:456,user_id:123,shop_name:'MeshHarbor3D',currency_code:'USD'});
  if(url.endsWith('/listings')){assert.equal(new URLSearchParams(options.body).get('type'),'download');return Response.json({listing_id:4004,state:'draft'});}
  if(url.endsWith('/images'))return Response.json({listing_image_id:5005});
  if(url.endsWith('/files')){fileCalls++;assert.equal(options.body.get('file').name,'stand.stl');assert.deepEqual(Buffer.from(await options.body.get('file').arrayBuffer()),asset);return Response.json({listing_file_id:6006});}
  assert.equal(fileCalls,1);return Response.json({listing_id:4004,state:'active'});
 });assert.equal(downloaded.status,'published');assert.equal(fileCalls,1);
 const writeAuth=beginAuthorization(store,'owner-session',Date.now(),true);
 assert.ok(new URL(writeAuth.url).searchParams.get('scope').includes('listings_w'));
 await completeAuthorization(store,'owner-session',new URL(writeAuth.url).searchParams.get('state'),'fixture-code',async(url)=>url.endsWith('/oauth/token')?Response.json({access_token:'123.newWriteSecret',refresh_token:'123.newRefreshSecret',expires_in:3600,token_type:'Bearer',scope:'shops_r listings_r transactions_r listings_w'}):Response.json({shop_id:456,user_id:123,shop_name:'MeshHarbor3D'}));
 assert.ok(store.status().scopes.includes('listings_w'));
 console.log('Etsy publication fixtures: default-off, exact preview/fee approval, current tested revision, single-unit stock, write PKCE, fixed hosts, no retries and unknown-outcome retention passed. No live writes.');
}finally{pub.close();store.close();rmSync(dir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {CommerceStore} from '../lib/commerce/store.ts';
const base=process.env.CATALOG_SHIPPING_TEST_URL,db=process.env.COMMERCE_DATABASE_PATH;
if(!base||!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||!db||!process.env.CATALOG_SHIPPING_TEST_DB||db!==process.env.CATALOG_SHIPPING_TEST_DB)throw Error('Disposable local shipping URL and exact test database required.');
const api=base+'/api/owner/catalog/shipping';
assert.equal((await fetch(api)).status,401);
const login=await fetch(base+'/api/owner/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:process.env.CATALOG_SHIPPING_TEST_PASSWORD})});assert.equal(login.status,200);
const headers={Origin:base,Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'},post=value=>fetch(api,{method:'POST',headers,body:JSON.stringify(value)});
assert.equal((await fetch(api,{method:'POST',headers:{...headers,Origin:'https://invalid.example'},body:'{}'})).status,403);
assert.equal((await post({action:'pack',id:crypto.randomUUID(),parcel:{weightOz:0,lengthIn:1,widthIn:1,heightIn:1}})).status,400);
const store=new CommerceStore(db);let packed;
try{
 const p=store.prepare({projectId:crypto.randomUUID(),revisionId:crypto.randomUUID(),name:'DISPOSABLE shipping API fixture',description:'Synthetic',license:'Personal',physicalPriceCents:1000,digitalPriceCents:100,costCents:100,stock:2,filename:'test.stl',data:Buffer.from('fixture'),photoUrl:'https://example.test/fixture.png'});store.approve(p.id);
 const {order:o}=store.reserve([{id:p.id,digital:false,quantity:1}],500,false);
 const parcel={weightOz:4,lengthIn:6,widthIn:4,heightIn:2};assert.equal((await post({action:'pack',id:o.id,parcel})).status,409);
 store.bind(o.id,'cs_'+o.id);store.paid({id:'cs_'+o.id,livemode:false,currency:'usd',payment_status:'paid',payment_intent:'pi_'+o.id,amount_subtotal:1000,amount_total:1500,total_details:{amount_shipping:500,amount_tax:0,amount_discount:0},shipping_details:{name:'Synthetic buyer',address:{line1:'388 Townsend St',city:'San Francisco',state:'CA',postal_code:'94107',country:'US'}},metadata:{commerce_order_id:o.id,commerce_fingerprint:o.fingerprint}});
 assert.equal((await post({action:'pack',id:o.id,parcel})).status,200);packed=store.shippingForOrder(o.id);
 assert.equal((await post({action:'approve',id:o.id,version:packed.version,rateId:'rate_fake',approvedCents:500,confirm:true})).status,409);
 assert.equal((await fetch(base+'/api/owner/catalog/shipping/label?id='+o.id)).status,401);
 assert.equal((await fetch(base+'/api/owner/catalog/shipping/label?id='+o.id,{headers})).status,409);
 const view=await fetch(api,{headers});assert.equal(view.status,200);assert.equal(view.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(await view.json()).includes('tokenHash'),false);
 console.log('Production-build shipping owner/origin, validation, payment gates, protected printing and private overview passed.');
}finally{store.close();}

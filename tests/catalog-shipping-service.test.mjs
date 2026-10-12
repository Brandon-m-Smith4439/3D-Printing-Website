import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {CommerceStore} from '../lib/commerce/store.ts';
import {getCatalogRates,purchaseCatalogLabel,reconcileCatalogLabel,applyCatalogTrackerEvent} from '../lib/commerce/shipping.ts';
const dir=mkdtempSync(path.join(tmpdir(),'shipping-service-')),store=new CommerceStore(path.join(dir,'commerce.sqlite'));
try{
 const p=store.prepare({projectId:'service',revisionId:'r1',name:'Fixture',description:'Fixture',license:'Personal',physicalPriceCents:1000,digitalPriceCents:100,costCents:100,stock:5,filename:'test.stl',data:Buffer.from('fixture'),photoUrl:'https://example.test/test.png'});store.approve(p.id);
 function paid(live=false){const {order:o}=store.reserve([{id:p.id,digital:false,quantity:1}],500,live);store.bind(o.id,'cs_'+o.id);store.paid({id:'cs_'+o.id,livemode:live,currency:'usd',payment_status:'paid',payment_intent:'pi_'+o.id,amount_subtotal:1000,amount_total:1500,total_details:{amount_shipping:500,amount_tax:0,amount_discount:0},shipping_details:{name:'Fixture',address:{line1:'388 Townsend St',city:'San Francisco',state:'CA',postal_code:'94107',country:'US'}},metadata:{commerce_order_id:o.id,commerce_fingerprint:o.fingerprint}});return store.packOrder(o.id,{weightOz:4,lengthIn:6,widthIn:4,heightIn:2});}
 let calls=0,buyCalls=0,origin='417 Montgomery St',failBuy=false,labelReady=false;
 const rate={id:'rate_test',carrier:'USPS',service:'GroundAdvantage',rateCents:500,deliveryDays:3,deliveryDate:''};
 const label={labelUrl:'https://easypost-files.s3.amazonaws.com/test.png',trackingCode:'TEST',trackerId:'trk_test',postageCents:500};
 const deps={credential:'EZTK_fixture',liveEnabled:false,now:()=>new Date('2026-10-11T12:00:00Z'),origin:async()=>({name:'Fixture sender',street1:origin,street2:'',city:'San Francisco',state:'CA',zip:'94104',country:'US'}),rates:async()=>{calls++;return {id:'shp_test',mode:'test',rates:[rate]};},read:async()=>{calls++;return {id:'shp_test',mode:'test',rates:[rate],label:labelReady?label:null};},buy:async()=>{buyCalls++;if(failBuy)throw Error('Timeout after provider accepted');return {id:'shp_test',mode:'test',rates:[rate],label};}};
 const s=paid();await assert.rejects(()=>getCatalogRates(store,s.orderId,s.version,{...deps,credential:'EZAK_fixture'}),/mode/i);assert.equal(calls,0);
 const live=paid(true);await assert.rejects(()=>getCatalogRates(store,live.orderId,live.version,deps),/mode/i);assert.equal(calls,0);
 let rated=await getCatalogRates(store,s.orderId,s.version,deps);assert.equal(rated.state,'rated');
 origin='Different origin';await assert.rejects(()=>purchaseCatalogLabel(store,{orderId:s.orderId,version:rated.version,rateId:rate.id,approvedCents:500},deps),/changed/i);assert.equal(buyCalls,0);origin='417 Montgomery St';
 await assert.rejects(()=>purchaseCatalogLabel(store,{orderId:s.orderId,version:rated.version,rateId:rate.id,approvedCents:500},{...deps,read:async()=>{origin='Changed during provider read';return {id:'shp_test',mode:'test',rates:[rate],label:null};}}),/changed/i);assert.equal(buyCalls,0);origin='417 Montgomery St';
 const captured=paid();await getCatalogRates(store,captured.orderId,captured.version,{...deps,rates:async(_parcel,_address,sender)=>{assert.equal(sender.street1,origin);return {id:'shp_test',mode:'test',rates:[rate],label:null};}});
 failBuy=true;const uncertain=await purchaseCatalogLabel(store,{orderId:s.orderId,version:rated.version,rateId:rate.id,approvedCents:500},deps);assert.equal(uncertain.state,'reconcile');assert.equal(buyCalls,1);
 await assert.rejects(()=>purchaseCatalogLabel(store,{orderId:s.orderId,version:uncertain.version,rateId:rate.id,approvedCents:500},deps));assert.equal(buyCalls,1);
 labelReady=true;const recovered=await reconcileCatalogLabel(store,s.orderId,deps);assert.equal(recovered.state,'label-ready');assert.equal(buyCalls,1);assert.equal(store.shippingOrder(s.orderId).status,'paid');
 const mismatch=paid();rated=await getCatalogRates(store,mismatch.orderId,mismatch.version,deps);await assert.rejects(()=>purchaseCatalogLabel(store,{orderId:mismatch.orderId,version:rated.version,rateId:rate.id,approvedCents:500},{...deps,read:async()=>({id:'shp_test',mode:'production',rates:[rate],label:null})}),/mode/i);assert.equal(buyCalls,1);
 store.refunded(mismatch.orderId,'pi_'+mismatch.orderId,false,100);await assert.rejects(()=>purchaseCatalogLabel(store,{orderId:mismatch.orderId,version:rated.version,rateId:rate.id,approvedCents:500},deps));assert.equal(buyCalls,1);
 assert.equal(applyCatalogTrackerEvent(store,'evt_unknown',{id:'trk_unknown',trackingCode:'UNKNOWN',status:'delivered'},'2026-10-11T13:00:00Z'),null);
 applyCatalogTrackerEvent(store,'evt_delivered',{id:recovered.trackerId,trackingCode:recovered.trackingCode,status:'delivered'},'2026-10-11T13:00:00Z');const delivered=store.shippingForOrder(s.orderId);assert.equal(delivered.trackingStatus,'delivered');
 assert.equal(applyCatalogTrackerEvent(store,'evt_delivered',{id:recovered.trackerId,trackingCode:recovered.trackingCode,status:'delivered'},'2026-10-11T13:00:00Z'),null);assert.equal(store.shippingForOrder(s.orderId).version,delivered.version);
 applyCatalogTrackerEvent(store,'evt_old',{id:recovered.trackerId,trackingCode:recovered.trackingCode,status:'pre_transit'},'2026-10-11T12:30:00Z');assert.equal(store.shippingForOrder(s.orderId).trackingStatus,'delivered');assert.equal(store.shippingOrder(s.orderId).status,'paid');
 store.refunded(s.orderId,'pi_'+s.orderId,false,100);assert.match(store.shippingForOrder(s.orderId).reviewReason,/refund/i);assert.equal(buyCalls,1);assert.throws(()=>store.handoffShipping(s.orderId,store.shippingForOrder(s.orderId).version));
 console.log('Carrier mode, origin, exact approval, timeout reconciliation and no duplicate purchase passed.');
}finally{store.close();rmSync(dir,{recursive:true,force:true});}

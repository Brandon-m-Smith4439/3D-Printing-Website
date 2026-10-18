import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CommerceStore} from '../lib/commerce/store.ts';
const dir=mkdtempSync(path.join(tmpdir(),'catalog-shipping-')),file=path.join(dir,'commerce.sqlite'),a=new CommerceStore(file),b=new CommerceStore(file);
try{
 const p=a.prepare({projectId:'shipping-test',revisionId:'r1',name:'Synthetic print',description:'Test',license:'Personal',physicalPriceCents:1000,digitalPriceCents:100,costCents:100,stock:10,filename:'test.stl',data:Buffer.from('test'),photoUrl:'https://example.test/photo.png'});a.approve(p.id);
 function order(digital=false){return a.reserve([{id:p.id,digital,quantity:1}],digital?0:500,false).order;}
 function pay(o){a.bind(o.id,'cs_'+o.id);a.paid({id:'cs_'+o.id,livemode:false,currency:'usd',payment_status:'paid',payment_intent:'pi_'+o.id,amount_subtotal:o.subtotalCents,amount_total:o.totalCents,total_details:{amount_shipping:o.shippingCents,amount_tax:0,amount_discount:0},shipping_details:{name:'Fixture buyer',address:{line1:'388 Townsend St',city:'San Francisco',state:'CA',postal_code:'94107',country:'US'}},metadata:{commerce_order_id:o.id,commerce_fingerprint:o.fingerprint}});}
 const parcel={weightOz:4,lengthIn:6,widthIn:4,heightIn:2},pending=order();assert.throws(()=>a.packOrder(pending.id,parcel),/paid physical/i);pay(pending);
 const packed=a.packOrder(pending.id,parcel);assert.equal(packed.state,'packed');assert.throws(()=>a.packOrder(pending.id,{...parcel,weightOz:0}));
 const rate={id:'rate_test',carrier:'USPS',service:'GroundAdvantage',rateCents:500,deliveryDays:3,deliveryDate:''};
 const rated=a.saveShippingRates(pending.id,packed.version,{shipmentId:'shp_test',providerMode:'test',rates:[rate],contextHash:'fixture-context',expiresAt:'2026-10-11T15:00:00Z'});
 assert.throws(()=>a.claimShippingPurchase(pending.id,rated.version,rate.id,501,new Date('2026-10-11T14:59:00Z')),/approval/i);
 assert.throws(()=>a.claimShippingPurchase(pending.id,rated.version,rate.id,500,new Date('2026-10-11T15:01:00Z')),/expired/i);
 const claimed=a.claimShippingPurchase(pending.id,rated.version,rate.id,500,new Date('2026-10-11T14:59:00Z'));assert.equal(claimed.state,'buying');assert.throws(()=>b.claimShippingPurchase(pending.id,rated.version,rate.id,500,new Date('2026-10-11T14:59:00Z')));
 assert.equal(b.shippingForOrder(pending.id).claimId,claimed.claimId);assert.throws(()=>a.packOrder(pending.id,parcel),/purchase/i);
 a.failShippingPurchase(pending.id,claimed.claimId,'Carrier outcome needs reconciliation.');assert.equal(b.shippingForOrder(pending.id).state,'reconcile');
 assert.throws(()=>a.claimShippingPurchase(pending.id,a.shippingForOrder(pending.id).version,rate.id,500),/approval/i);
 const ready=a.finishShippingPurchase(pending.id,claimed.claimId,{labelUrl:'https://easypost-files.s3.amazonaws.com/fixture.png',trackingCode:'TEST',trackerId:'trk_test',postageCents:500});assert.equal(ready.state,'label-ready');assert.equal(a.shippingOrder(pending.id).status,'paid');
 const digital=order(true);pay(digital);assert.throws(()=>a.packOrder(digital.id,parcel),/paid physical/i);
 const revoked=order();pay(revoked);a.revoke(revoked.id);assert.throws(()=>a.packOrder(revoked.id,parcel),/paid physical/i);
 const edited=order();pay(edited);let e=a.packOrder(edited.id,parcel);e=a.saveShippingRates(edited.id,e.version,{shipmentId:'shp_edited',providerMode:'test',rates:[rate],contextHash:'context',expiresAt:'2099-01-01T00:00:00Z'});const repacked=a.packOrder(edited.id,{...parcel,weightOz:5});assert.equal(repacked.rates.length,0);assert.throws(()=>a.claimShippingPurchase(edited.id,e.version,rate.id,500),/version/i);
 console.log('Durable catalog packing, exact approval, cross-connection claims and refund/payment guards passed.');
}finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}

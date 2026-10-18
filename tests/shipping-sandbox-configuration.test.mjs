import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {shippingSandboxEnabled,catalogCarrierCredential,catalogLabelEmailKey} from '../lib/commerce/shipping-configuration.ts';
const env={COMMERCE_SHIPPING_SANDBOX_ENABLED:'true',COMMERCE_SANDBOX_FIXTURE:'true',EASYPOST_LIVE_ENABLED:'false',STRIPE_LIVE_ENABLED:'false',CATALOG_SHIPPING_TEST_EASYPOST_API_KEY:'EZTK_fixture',CATALOG_SHIPPING_TEST_RESEND_API_KEY:'re_fixture',OWNER_SHIPPING_EMAIL:'owner@example.test',DATABASE_PATH:'/sandbox-data/business.sqlite',AI_CENTER_DATABASE_PATH:'/sandbox-data/ai.sqlite',COMMERCE_DATABASE_PATH:'/sandbox-data/commerce.sqlite',MARKETPLACE_DATABASE_PATH:'/sandbox-data/market.sqlite'};
assert.equal(shippingSandboxEnabled(env),true);
assert.equal(shippingSandboxEnabled({...env,CATALOG_SHIPPING_TEST_EASYPOST_API_KEY:'EZTKfixtureNoUnderscore'}),true);
const names=['DATABASE_PATH','AI_CENTER_DATABASE_PATH','COMMERCE_DATABASE_PATH','MARKETPLACE_DATABASE_PATH'];
for(const prefix of ['sandbox-data','C:/DATA/sandbox-data'])assert.throws(()=>shippingSandboxEnabled({...env,...Object.fromEntries(names.map((name,i)=>[name,`${prefix}/${i}.sqlite`]))}),/sandbox/i);
const temporary=mkdtempSync(path.join(os.tmpdir(),'mesh-shipping-isolation-'));
try{
 mkdirSync(path.join(temporary,'data'));
 symlinkSync(path.join(temporary,'data'),path.join(temporary,'sandbox-data'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>shippingSandboxEnabled({...env,...Object.fromEntries(names.map((name,i)=>[name,path.join(temporary,'sandbox-data',`${i}.sqlite`)]))}),/resolving links/i);
}finally{
 if(path.dirname(path.resolve(temporary))!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('mesh-shipping-isolation-'))throw Error('Unsafe temporary cleanup path');
 rmSync(temporary,{recursive:true,force:true});
}
assert.equal(catalogCarrierCredential(env),'EZTK_fixture');assert.equal(catalogLabelEmailKey(env),'re_fixture');
for(const changes of [{COMMERCE_SANDBOX_FIXTURE:'false'},{EASYPOST_LIVE_ENABLED:'true'},{STRIPE_LIVE_ENABLED:'true'},{CATALOG_SHIPPING_TEST_EASYPOST_API_KEY:'EZAK_live'},{CATALOG_SHIPPING_TEST_EASYPOST_API_KEY:'unknown'},{CATALOG_SHIPPING_TEST_RESEND_API_KEY:''},{OWNER_SHIPPING_EMAIL:''},{COMMERCE_DATABASE_PATH:'/data/commerce.sqlite'},{MARKETPLACE_DATABASE_PATH:'/sandbox-data/commerce.sqlite'},{COMMERCE_SHIPPING_SANDBOX_ENABLED:'false'}])assert.throws(()=>shippingSandboxEnabled({...env,...changes}),/sandbox/i);
assert.equal(catalogCarrierCredential({EASYPOST_API_KEY:'EZAK_existing'}),'EZAK_existing');assert.equal(catalogLabelEmailKey({RESEND_API_KEY:'re_existing'}),'re_existing');assert.equal(shippingSandboxEnabled({}),false);
console.log('Fulfillment sandbox requires explicit isolated paths, TEST postage, locked live modes and owner recipient; production defaults unchanged.');

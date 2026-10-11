import assert from 'node:assert/strict';
import {createTestLabel} from '../lib/easypost-test-label.ts';
let calls=0;
const never=async()=>{calls++;throw Error('Must not contact carrier with a live key');};
await assert.rejects(()=>createTestLabel('EZAK_synthetic_live',never),/test key/i);
await assert.rejects(()=>createTestLabel('',never),/test key/i);
assert.equal(calls,0);
const requests=[];
const fake=async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});return {ok:true,json:async()=>requests.length===1?{id:'shp_test',mode:'test',rates:[{id:'rate_expensive',carrier:'USPS',service:'Priority',rate:'8.00'},{id:'rate_cheaper',carrier:'USPS',service:'GroundAdvantage',rate:'5.00'}]}:{id:'shp_test',mode:'test',tracking_code:'TEST123',postage_label:{label_url:'https://easypost-files.s3.us-west-2.amazonaws.com/test.png'}}};};
const result=await createTestLabel('EZTK_synthetic_test',fake);
assert.equal(result.testOnly,true);assert.equal(result.carrier,'USPS');assert.equal(result.rateCents,500);
assert.equal(requests[0].payload.shipment.options.label_size,'4x6');
assert.equal(requests[1].payload.rate.id,'rate_cheaper');
assert.equal(requests.length,2);
let mismatchCalls=0;
await assert.rejects(()=>createTestLabel('EZTK_synthetic_test',async()=>{mismatchCalls++;return {ok:true,json:async()=>({id:'shp_live',mode:'production',rates:[]})};}),/mode/i);
assert.equal(mismatchCalls,1,'Mode mismatch must block before purchase');
console.log('EasyPost test-only label guards and 4x6 selection passed.');


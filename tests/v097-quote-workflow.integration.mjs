// Run only against the local test server with the documented fake credentials.
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
const base='http://127.0.0.1:3000';
let owner='';
async function call(url,method='GET',body,cookie=owner){const response=await fetch(base+url,{method,headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});let data={};try{data=await response.json()}catch{}return {response,data};}
let login=await call('/api/owner/login','POST',{password:'local-smoke-password-only'},'');assert.equal(login.response.status,200);owner=login.response.headers.get('set-cookie').split(';')[0];
assert.equal((await call('/api/owner/requests/x/quote-email','POST',undefined,'')).response.status,401);
assert.equal((await call('/api/owner/requests/x/choices','POST',{},'')).response.status,401);
let pricing=await call('/api/owner/pricing/settings','PATCH',{defaultMachineHourlyCostCents:100,defaultDesignHourlyCostCents:1800,defaultPostProcessingHourlyCostCents:1800});assert.equal(pricing.response.status,200);
async function create(choices={}){let out=await call('/api/owner/requests','POST',{name:'Smoke Customer',email:'smoke@example.test',description:'Test-only local quote workflow',fulfillmentMethod:'pickup',assemblyPreference:'disassembled',paymentPreference:'stripe',...choices});assert.equal(out.response.status,201,JSON.stringify(out.data));return out.data.request;}
const costing={materialLines:[],machineHours:10,printerWatts:250,electricityRatePerKwh:.1059,designHours:.5,postProcessingHours:.25,laborHours:0,packagingCostCents:0,localDeliveryInternalCostCents:0,miscellaneousCostCents:0,targetMarginBasisPoints:2000};
const payload={basePriceCents:5000,assemblyMode:'disassembled',assemblyFeeCents:0,rushFeeCents:0,fulfillmentMode:'pickup',paymentMethod:'stripe',localPaymentMethod:null,localDeliveryFeeCents:0,packageWeightOz:0,packageLengthIn:0,packageWidthIn:0,packageHeightIn:0,totalCents:5000,depositCents:2500,material:'Bambu PLA Basic',dimensions:'100 x 80 x 40 mm',estimatedReadyDate:new Date(Date.now()+60*86400000).toISOString().slice(0,10),notes:'Smoke validation',terms:'Customer approves these local test quote terms.',action:'send',costing};
const undecided=await create({fulfillmentMethod:'unsure',assemblyPreference:'unsure'});
assert.equal((await call(`/api/owner/requests/${undecided.id}/quote`,'POST',payload)).response.status,409);
const unsureDraft=await call(`/api/owner/requests/${undecided.id}/quote`,'POST',{...payload,action:'save'});assert.equal(unsureDraft.response.status,200);
assert.equal((await call(`/api/owner/requests/${undecided.id}/quote-approve-in-person`,'POST')).response.status,409);
assert.equal((await call(`/api/owner/requests/${undecided.id}/choices`,'POST',{fulfillmentMethod:'pickup',assemblyPreference:'disassembled',customerConfirmed:true})).response.status,200);
const draft=await call(`/api/owner/requests/${undecided.id}/quote`,'POST',{...payload,action:'save'});assert.equal(draft.response.status,200,JSON.stringify(draft.data));
assert.equal(draft.data.costing.electricityCostCents,26);
const approved=await call(`/api/owner/requests/${undecided.id}/quote-approve-in-person`,'POST');assert.equal(approved.response.status,200,JSON.stringify(approved.data));
for(const action of ['counter','decline','approve']){
 const req=await create();let sent=await call(`/api/owner/requests/${req.id}/quote`,'POST',payload);assert.equal(sent.response.status,200,JSON.stringify(sent.data));assert.equal(sent.data.emailStatus,'unconfigured');
 const tokenBody=Buffer.from(JSON.stringify({rid:req.id,code:req.requestCode,eh:createHash('sha256').update(req.email.toLowerCase()).digest('base64url'),kind:'access',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 const token=tokenBody+'.'+createHmac('sha256','local-smoke-customer-secret-123456789012345').update(tokenBody).digest('base64url');
 const access=await call('/request/access?token='+encodeURIComponent(token),'GET',undefined,'');assert.equal(access.response.status,307);assert.equal(new URL(access.response.headers.get('location')).origin,base);const guest=access.response.headers.get('set-cookie').split(';')[0];
 const out=action==='approve'?await call(`/api/guest/quotes/${sent.data.quote.id}/approve`,'POST',{accepted:true,policyVersion:'2026-09-26-v2'},guest):await call(`/api/guest/quotes/${sent.data.quote.id}/respond`,'POST',{action,counterTotalCents:action==='counter'?4000:0,message:'Local test response'},guest);
 assert.equal(out.response.status,200,JSON.stringify(out.data));assert.equal(out.data.quote.status,action==='approve'?'approved':action==='counter'?'countered':'declined');
}
const locked=await create();assert.equal((await call(`/api/owner/requests/${locked.id}/choices`,'POST',{fulfillmentMethod:'shipping',assemblyPreference:'disassembled',customerConfirmed:true})).response.status,409);
assert.equal((await call('/api/owner/operations')).response.status,200);
assert.equal((await call('/api/health')).data.version,'1.0.0');
console.log('HTTP smoke passed: drafts, electricity snapshot, guest access + approve/decline/counter, in-person approval, preference protection, owner dashboard and auth boundaries. No real emails or payments sent.');

import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const db=`/tmp/meshharbor-followup-engine-${process.pid}.sqlite`;
process.env.DATABASE_PATH=db;
await rm(db,{force:true});

const store=await import('../lib/customer-follow-up-store.ts');
const database=await import('../lib/database.ts');
const engine=await import('../lib/customer-follow-up-engine.ts');
async function resetState(){ await database.writeCollection('customer-follow-ups',[]); await database.writeCollection('customer-follow-up-controls',[]); await database.writeSingleton('customer-follow-up-settings',{enabled:false,updatedAt:'',updatedBy:'system'}); }
const NOW=new Date('2026-09-25T12:00:00.000Z');
const H=60*60*1000;
const isoAgo=(h)=>new Date(NOW.getTime()-h*H).toISOString();

function account(overrides={}) { return {id:'cus-1',email:'customer@example.com',displayName:'Customer',emailVerifiedAt:isoAgo(500),sessionVersion:1,preferences:{emailStatusUpdates:true,showQueuePosition:true},stripeCustomerTestId:'',stripeCustomerLiveId:'',passwordSalt:'',passwordHash:'',createdAt:isoAgo(600),updatedAt:isoAgo(500),...overrides}; }
function request(id='req-1',overrides={}) { return {id,requestCode:id==='req-1'?'REQ-ONE':'REQ-TWO',status:'quoted',name:'Customer',email:'customer@example.com',phone:'',projectType:'display',modelStatus:'ready',fulfillmentMethod:'pickup',quantity:1,dimensions:'6 in',materialPreference:'pla',colorPreference:'blue',budget:'',neededBy:'',referenceUrl:'',description:'Test',imageUrl:'',internalNote:'',createdAt:isoAgo(200),updatedAt:isoAgo(48),queuedAt:'',queueJobId:'',customerAccountId:'cus-1',source:'customer',emailNotifications:true,...overrides}; }
function quote(requestId='req-1',overrides={}) { return {id:`q-${requestId}`,requestId,requestCode:requestId==='req-1'?'REQ-ONE':'REQ-TWO',customerAccountId:'cus-1',revision:1,status:'sent',sentAt:isoAgo(48),approvedAt:'',updatedAt:isoAgo(48),createdAt:isoAgo(48),depositCents:5000,payments:[],refunds:[],totalCents:10000,...overrides}; }
function data(overrides={}) { return {requests:[request()],quotes:[quote()],invoices:[],accounts:[account()],controls:[],...overrides}; }

let sendCalls=[]; let notifyCalls=[]; let auditCalls=[];
const deps=(fixture,extra={})=>({
  now:NOW,
  loadData:async()=>fixture,
  sendEmail:async({record})=>{sendCalls.push(record.id); return {ok:true,emailId:`em_${sendCalls.length}`};},
  notify:async(_request,_message,options)=>{notifyCalls.push(options?.notificationId||'');},
  audit:async(entry)=>{auditCalls.push(entry.action);},
  deploymentEnabled:true,
  ...extra,
});

let preview=await engine.previewCustomerFollowUps(NOW,{loadData:async()=>data()});
assert.equal(preview.counts.due,1);
assert.equal((await store.readFollowUps()).length,0);

await store.updateFollowUpSettings(true,'owner');
let result=await engine.runCustomerFollowUpSweep(deps(data(),{deploymentEnabled:false}));
assert.equal(result.sent,0);
assert.equal(sendCalls.length,0);

await store.updateFollowUpSettings(false,'owner');
result=await engine.runCustomerFollowUpSweep(deps(data()));
assert.equal(result.sent,0);
assert.equal(sendCalls.length,0);

await store.updateFollowUpSettings(true,'owner');
result=await engine.runCustomerFollowUpSweep(deps(data()));
assert.equal(result.sent,1);
assert.equal(sendCalls.length,1);
assert.equal(notifyCalls.length,1);
let records=await store.readFollowUps();
assert.equal(records[0].status,'sent');
assert.ok(records[0].sentAt);
assert.equal(records[0].resendEmailId,'em_1');

result=await engine.runCustomerFollowUpSweep(deps(data()));
assert.equal(result.sent,0);
assert.equal(sendCalls.length,1);
assert.equal(notifyCalls.length,1);

await resetState();
sendCalls=[]; notifyCalls=[]; auditCalls=[];
await store.updateFollowUpSettings(true,'owner');
result=await engine.runCustomerFollowUpSweep(deps(data(),{sendEmail:async({record})=>{sendCalls.push(record.id);return {ok:false,retryable:true,reason:'Temporary provider failure.'};}}));
assert.equal(result.failed,1);
records=await store.readFollowUps();
assert.equal(records[0].attemptCount,1);
assert.equal(records[0].status,'failed');
assert.ok(records[0].nextAttemptAt);
assert.equal(notifyCalls.length,1);

// Exhausted or permanent failed records are terminal and must not resend on later sweeps.
await store.updateFollowUp(records[0].id,{status:'failed',attemptCount:3,nextAttemptAt:'',reason:'Email service is temporarily unavailable.'});
const sendsBeforeTerminalRetry=sendCalls.length;
result=await engine.runCustomerFollowUpSweep(deps(data(),{sendEmail:async({record})=>{sendCalls.push(record.id);return {ok:true,emailId:'should-not-send'};}}));
assert.equal(result.sent,0);
assert.equal(sendCalls.length,sendsBeforeTerminalRetry);

await resetState();
sendCalls=[]; notifyCalls=[]; auditCalls=[];
await store.updateFollowUpSettings(true,'owner');
result=await engine.runCustomerFollowUpSweep(deps(data(),{sendEmail:async()=>({ok:false,retryable:false,reason:'Customer email updates are disabled.'})}));
records=await store.readFollowUps();
assert.equal(records[0].status,'canceled');
assert.equal(records[0].nextAttemptAt,'');

await resetState();
await store.updateFollowUpSettings(true,'owner');
await store.upsertFollowUp({id:'req-1:quote:q-old:r1:stage1',requestId:'req-1',requestCode:'REQ-ONE',customerAccountId:'cus-1',type:'quote',stage:1,anchorId:'q-old',anchorRevision:1,dueAt:isoAgo(20),status:'pending',subject:'old',text:'old',idempotencyKey:'meshharbor:old',attemptCount:0,lastAttemptAt:'',nextAttemptAt:'',sentAt:'',resendEmailId:'',reason:'',createdAt:isoAgo(50),updatedAt:isoAgo(50)});
await engine.runCustomerFollowUpSweep(deps(data({quotes:[quote('req-1',{id:'q-new',revision:2})]})));
records=await store.readFollowUps();
assert.equal(records.find(x=>x.id.includes('q-old')).status,'canceled');

await rm(db,{force:true});
console.log('Customer follow-up engine checks passed.');

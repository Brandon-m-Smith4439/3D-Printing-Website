import assert from 'node:assert/strict';
import { buildFollowUpCandidates, followUpRecordId, followUpPriority } from '../lib/customer-follow-up-policy.ts';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const H = 60 * 60 * 1000;
const isoAgo = (hours) => new Date(NOW.getTime() - hours * H).toISOString();
const isoIn = (hours) => new Date(NOW.getTime() + hours * H).toISOString();

function account(overrides={}) {
  return {
    id:'cus-1', email:'customer@example.com', displayName:'Customer', emailVerifiedAt:'2026-09-01T00:00:00.000Z', sessionVersion:1,
    preferences:{emailStatusUpdates:true,showQueuePosition:true}, stripeCustomerTestId:'', stripeCustomerLiveId:'', passwordSalt:'', passwordHash:'',
    createdAt:'2026-09-01T00:00:00.000Z', updatedAt:'2026-09-01T00:00:00.000Z', ...overrides,
  };
}
function request(overrides={}) {
  return {
    id:'req-1', requestCode:'REQ-ABC123', status:'quoted', name:'Customer', email:'customer@example.com', phone:'', projectType:'display', modelStatus:'ready',
    fulfillmentMethod:'pickup', quantity:1, dimensions:'6 in', materialPreference:'pla', colorPreference:'blue', budget:'', neededBy:'', referenceUrl:'',
    description:'Test', imageUrl:'', internalNote:'', createdAt:isoAgo(240), updatedAt:isoAgo(48), queuedAt:'', queueJobId:'', customerAccountId:'cus-1',
    source:'customer', emailNotifications:true, ...overrides,
  };
}
function quote(overrides={}) {
  const sentAt = isoAgo(48);
  return {
    id:'quote-1', requestId:'req-1', requestCode:'REQ-ABC123', customerAccountId:'cus-1', revision:1, status:'sent', sentAt, approvedAt:'', updatedAt:sentAt,
    createdAt:sentAt, depositCents:5000, payments:[], refunds:[], totalCents:10000, ...overrides,
  };
}
function invoice(overrides={}) {
  const sentAt=isoAgo(24);
  return {
    id:'inv-1', requestId:'req-1', requestCode:'REQ-ABC123', quoteId:'quote-1', quoteRevision:1, customerAccountId:'cus-1', stripeCustomerId:'cus_test',
    stripeInvoiceId:'in_1', stripeInvoiceNumber:'INV-1', status:'open', amountDueCents:5000, amountPaidCents:0, amountRemainingCents:5000, currency:'usd',
    hostedInvoiceUrl:'https://example.test/invoice', invoicePdfUrl:'', dueDate:isoIn(24), createdAt:sentAt, sentAt, paidAt:'', paymentFailedAt:'', updatedAt:sentAt, lastError:'', ...overrides,
  };
}
function build({req=request(), q=quote(), invoices=[], accounts=[account()], controls=[], records=[]}={}) {
  return buildFollowUpCandidates({now:NOW, requests:[req], quotes:q?[q]:[], invoices, accounts, controls, records});
}
const eligible=(items,type,stage)=>items.find(x=>x.type===type&&x.stage===stage&&x.eligible);

function sentRecord({type='quote',stage=1,anchorId='quote-1',anchorRevision=1,sentAt=isoAgo(30),id}={}) {
  const requestId='req-1';
  const computedId=id || (type==='final-invoice' ? `${requestId}:invoice:${anchorId}:stage${stage}` : `${requestId}:${type}:${anchorId}:r${anchorRevision}:stage${stage}`);
  return {id:computedId,requestId,requestCode:'REQ-ABC123',customerAccountId:'cus-1',type,stage,anchorId,anchorRevision,dueAt:isoAgo(31),status:'sent',subject:'s',text:'t',idempotencyKey:`meshharbor:${computedId}`,attemptCount:1,lastAttemptAt:sentAt,nextAttemptAt:'',sentAt,resendEmailId:'em_1',reason:'',createdAt:isoAgo(32),updatedAt:sentAt};
}

let items=build();
assert.ok(eligible(items,'quote',1));
assert.equal(followUpRecordId(eligible(items,'quote',1)),'req-1:quote:quote-1:r1:stage1');
assert.equal(eligible(build({q:quote({sentAt:isoAgo(47),updatedAt:isoAgo(47),createdAt:isoAgo(47)})}),'quote',1),undefined);
assert.ok(eligible(build({q:quote({sentAt:isoAgo(120),updatedAt:isoAgo(120),createdAt:isoAgo(120)}),records:[sentRecord({sentAt:isoAgo(70)})]}),'quote',2));
assert.equal(followUpRecordId(eligible(build({q:quote({id:'quote-2',revision:2,sentAt:isoAgo(48),updatedAt:isoAgo(48),createdAt:isoAgo(48)})}),'quote',1)),'req-1:quote:quote-2:r2:stage1');
for (const status of ['approved','countered','declined']) assert.equal(eligible(build({q:quote({status,approvedAt: status==='approved'?isoAgo(24):''})}),'quote',1),undefined);

items=build({req:request({status:'accepted'}),q:quote({status:'approved',approvedAt:isoAgo(24),sentAt:isoAgo(72)})});
assert.ok(eligible(items,'deposit',1));
items=build({req:request({status:'accepted'}),q:quote({status:'approved',approvedAt:isoAgo(96),sentAt:isoAgo(120)}),records:[sentRecord({type:'deposit',sentAt:isoAgo(70)})]});
assert.ok(eligible(items,'deposit',2));
items=build({req:request({status:'accepted'}),q:quote({status:'approved',approvedAt:isoAgo(24),payments:[{id:'p1',revision:1,amountCents:1000,checkoutSessionId:'cs1',paymentIntentId:'pi1',paidAt:isoAgo(2)}]})});
assert.ok(eligible(items,'deposit',1));
assert.equal(eligible(build({req:request({status:'deposit-paid'}),q:quote({status:'deposit-paid',approvedAt:isoAgo(48),payments:[{id:'p1',revision:1,amountCents:5000,checkoutSessionId:'cs1',paymentIntentId:'pi1',paidAt:isoAgo(2)}]})}),'deposit',1),undefined);

items=build({req:request({status:'deposit-paid'}),q:quote({status:'deposit-paid'}),invoices:[invoice()]});
assert.ok(eligible(items,'final-invoice',1));
items=build({req:request({status:'deposit-paid'}),q:quote({status:'deposit-paid'}),invoices:[invoice({sentAt:isoAgo(72),dueDate:isoAgo(1)})],records:[sentRecord({type:'final-invoice',anchorId:'inv-1',anchorRevision:1,sentAt:isoAgo(30)})]});
assert.ok(eligible(items,'final-invoice',2));
for (const status of ['paid','void','uncollectible']) {
  assert.equal(eligible(build({req:request({status:'deposit-paid'}),q:quote({status:'deposit-paid'}),invoices:[invoice({status})]}),'final-invoice',1),undefined);
}

items=build({q:null,controls:[{id:'req-1',requestId:'req-1',paused:false,waitingOnCustomer:true,waitingSince:isoAgo(72),waitingNote:'Need dimensions',updatedAt:isoAgo(72)}]});
assert.ok(eligible(items,'waiting-on-customer',1));
assert.equal(eligible(build({q:null,controls:[{id:'req-1',requestId:'req-1',paused:false,waitingOnCustomer:false,waitingSince:'',waitingNote:'',updatedAt:NOW.toISOString()}]}),'waiting-on-customer',1),undefined);
for (const status of ['completed','declined']) assert.equal(build({req:request({status})}).some(x=>x.eligible),false);
assert.equal(build({req:request({customerAccountId:''})}).some(x=>x.eligible),false);
assert.equal(build({accounts:[account({emailVerifiedAt:''})]}).some(x=>x.eligible),false);
assert.equal(build({req:request({emailNotifications:false})}).some(x=>x.eligible),false);
assert.equal(build({controls:[{id:'req-1',requestId:'req-1',paused:true,waitingOnCustomer:false,waitingSince:'',waitingNote:'',updatedAt:NOW.toISOString()}]}).some(x=>x.eligible),false);

const alreadySent=sentRecord({sentAt:isoAgo(1)});
assert.equal(eligible(build({records:[alreadySent]}),'quote',1),undefined);

const recentOther={...alreadySent,id:'req-1:waiting:cycle:stage1',type:'waiting-on-customer',anchorId:'cycle',anchorRevision:0,sentAt:isoAgo(2),lastAttemptAt:isoAgo(2)};
assert.equal(build({q:quote({sentAt:isoAgo(120),updatedAt:isoAgo(120),createdAt:isoAgo(120)}),records:[recentOther]}).some(x=>x.eligible),false);

assert.deepEqual(['final-invoice','deposit','quote','waiting-on-customer'].map(followUpPriority),[0,1,2,3]);
const multi=build({
  req:request({status:'accepted'}),
  q:quote({status:'approved',approvedAt:isoAgo(120),sentAt:isoAgo(144)}),
  invoices:[invoice({sentAt:isoAgo(48),dueDate:isoAgo(1)})],
  controls:[{id:'req-1',requestId:'req-1',paused:false,waitingOnCustomer:true,waitingSince:isoAgo(96),waitingNote:'',updatedAt:isoAgo(96)}]
});
const due=multi.filter(x=>x.eligible);
assert.equal(due[0]?.type,'final-invoice');
assert.equal(due.filter(x=>x.eligible).length,1);

console.log('Customer follow-up policy checks passed.');

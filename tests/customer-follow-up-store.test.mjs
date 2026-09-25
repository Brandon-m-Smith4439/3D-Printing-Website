import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const db = `/tmp/meshharbor-followup-store-${process.pid}.sqlite`;
process.env.DATABASE_PATH = db;
await rm(db,{force:true});
const store = await import('../lib/customer-follow-up-store.ts');

const defaults = await store.getFollowUpSettings();
assert.equal(defaults.enabled,false);
assert.equal(defaults.updatedBy,'system');

const control = await store.updateFollowUpControl('req-1',{
  waitingOnCustomer:true,
  waitingSince:'2026-09-25T12:00:00.000Z',
  waitingNote:'Need customer measurements.',
});
assert.equal(control.paused,false);
assert.equal(control.waitingOnCustomer,true);
assert.equal(control.waitingSince,'2026-09-25T12:00:00.000Z');

const paused = await store.updateFollowUpControl('req-1',{paused:true});
assert.equal(paused.paused,true);
assert.equal((await store.followUpControlForRequest('req-1')).paused,true);

const savedSettings = await store.updateFollowUpSettings(true,'owner');
assert.equal(savedSettings.enabled,true);
assert.equal((await store.getFollowUpSettings()).enabled,true);

const record={
  id:'req-1:quote:q1:r1:stage1',requestId:'req-1',requestCode:'REQ-ABC123',customerAccountId:'cus-1',type:'quote',stage:1,anchorId:'q1',anchorRevision:1,
  dueAt:'2026-09-25T12:00:00.000Z',status:'pending',subject:'subject',text:'text',idempotencyKey:'meshharbor:req-1:quote:q1:r1:stage1',attemptCount:0,
  lastAttemptAt:'',nextAttemptAt:'',sentAt:'',resendEmailId:'',reason:'',createdAt:'2026-09-25T12:00:00.000Z',updatedAt:'2026-09-25T12:00:00.000Z'
};
await store.upsertFollowUp(record);
await store.upsertFollowUp({...record,subject:'changed'});
const rows=await store.followUpsForRequest('req-1');
assert.equal(rows.length,1);
assert.equal(rows[0].subject,'changed');

const updated=await store.updateFollowUp(record.id,{status:'sent',sentAt:'2026-09-25T13:00:00.000Z'});
assert.equal(updated.status,'sent');
assert.equal((await store.readFollowUps())[0].status,'sent');

const long='x'.repeat(400);
const trimmed=await store.updateFollowUpControl('req-2',{waitingNote:long});
assert.equal(trimmed.waitingNote.length,300);

await rm(db,{force:true});
console.log('Customer follow-up store checks passed.');

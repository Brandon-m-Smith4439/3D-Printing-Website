import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';

const db=`/tmp/meshharbor-followup-email-${process.pid}.sqlite`;
process.env.DATABASE_PATH=db;
await rm(db,{force:true});

const { resendFailureKind } = await import('../lib/customer-follow-up-email.ts');
const { notifyCustomer } = await import('../lib/customer-notifications.ts');
const { readCollection } = await import('../lib/database.ts');

const request={
  id:'req-1',requestCode:'REQ-ABC123',status:'quoted',name:'Customer',email:'customer@example.com',phone:'',projectType:'display',modelStatus:'ready',fulfillmentMethod:'pickup',
  quantity:1,dimensions:'6 in',materialPreference:'pla',colorPreference:'blue',budget:'',neededBy:'',referenceUrl:'',description:'Test',imageUrl:'',internalNote:'',
  createdAt:'2026-09-20T00:00:00.000Z',updatedAt:'2026-09-20T00:00:00.000Z',queuedAt:'',queueJobId:'',customerAccountId:'cus-1',source:'customer',emailNotifications:true,
};

await notifyCustomer(request,'Reminder',{email:false,notificationId:'followup:req-1:q1:stage1',subject:'Custom subject'});
await notifyCustomer(request,'Reminder',{email:false,notificationId:'followup:req-1:q1:stage1',subject:'Custom subject'});
const notifications=await readCollection('notifications');
assert.equal(notifications.length,1);
assert.equal(notifications[0].id,'followup:req-1:q1:stage1');

assert.equal(resendFailureKind(null,true),'retryable');
assert.equal(resendFailureKind(429),'retryable');
assert.equal(resendFailureKind(500),'retryable');
assert.equal(resendFailureKind(503),'retryable');
for (const status of [400,401,403,404,422]) assert.equal(resendFailureKind(status),'permanent');

await rm(db,{force:true});
console.log('Customer follow-up email checks passed.');

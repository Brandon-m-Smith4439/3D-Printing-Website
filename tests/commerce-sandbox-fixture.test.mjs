import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertSandboxEnvironment,seedCommerceSandbox} from '../scripts/seed-commerce-sandbox.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'fixture-'));
const root=path.join(dir,'sandbox-data');
const env={COMMERCE_SANDBOX_FIXTURE:'true',STRIPE_SECRET_KEY:'sk_test_fixture',COMMERCE_SANDBOX_PASSWORD:'private-fixture-password-123',DATABASE_PATH:path.join(root,'business.sqlite'),AI_CENTER_DATABASE_PATH:path.join(root,'ai.sqlite'),COMMERCE_DATABASE_PATH:path.join(root,'commerce.sqlite'),MARKETPLACE_DATABASE_PATH:path.join(root,'marketplace.sqlite')};
try {
  assert.throws(()=>assertSandboxEnvironment({...env,COMMERCE_SANDBOX_FIXTURE:'false'}),/opt-in/);
  for(const key of ['sk_live_fixture','rk_live_fixture','', 'unknown'])assert.throws(()=>assertSandboxEnvironment({...env,STRIPE_SECRET_KEY:key}),/test/);
  for(const name of ['DATABASE_PATH','AI_CENTER_DATABASE_PATH','COMMERCE_DATABASE_PATH','MARKETPLACE_DATABASE_PATH']){
    for(const value of ['/data/production.sqlite',path.join(root,'..','production.sqlite'),'',path.join(root,'data','production.sqlite')])assert.throws(()=>assertSandboxEnvironment({...env,[name]:value}),/isolated/);
  }
  assert.throws(()=>assertSandboxEnvironment({...env,AI_CENTER_DATABASE_PATH:env.DATABASE_PATH}),/distinct/);
  assert.throws(()=>assertSandboxEnvironment({...env,RESEND_API_KEY:'present'}),/disabled/);
  assert.throws(()=>assertSandboxEnvironment({...env,ETSY_ENABLED:'true'}),/disabled/);
  assert.throws(()=>assertSandboxEnvironment({...env,AI_CENTER_WORKER_ENABLED:'true'}),/disabled/);
  assert.throws(()=>assertSandboxEnvironment({...env,COMMERCE_SANDBOX_PASSWORD:'short'}),/password/);
  assert.equal(existsSync(root),false,'Rejected guards must not write databases');
  assert.doesNotThrow(()=>assertSandboxEnvironment({...env,STRIPE_SECRET_KEY:'rk_test_fixture'}));
  Object.assign(process.env,env);
  await seedCommerceSandbox();await seedCommerceSandbox();
  const {CommerceStore}=await import('../lib/commerce/store.ts');
  const {CenterStore}=await import('../lib/ai-center/store.ts');
  const {findCustomerByEmail,verifyCustomerPassword}=await import('../lib/customer-store.ts');
  const commerce=new CommerceStore(),center=new CenterStore();
  try{
    const products=commerce.catalog();assert.equal(products.length,1);assert.equal(products[0].physicalPriceCents,100);assert.equal(products[0].digitalPriceCents,100);assert.match(products[0].description,/synthetic/i);assert.match(products[0].name,/TEST ONLY/);assert.equal(products[0].stock,100);
    const projects=center.snapshot().projects;assert.equal(projects.length,1);assert.equal(projects[0].stage,'release');assert.match(projects[0].revisions[0].tests[0].notes,/not physically printed/i);
    const customer=await findCustomerByEmail('testcustomer@example.invalid');assert.ok(customer.emailVerifiedAt);assert.equal(await verifyCustomerPassword(customer,env.COMMERCE_SANDBOX_PASSWORD),true);assert.equal(customer.preferences.emailStatusUpdates,false);
    const held=commerce.reserve([{id:products[0].id,digital:true,quantity:1}],0,false,customer.id);assert.throws(()=>commerce.customerDownload(held.order.id,customer.id,products[0].id),/paid/);
  }finally{commerce.close();center.close();}
  console.log('Sandbox guards, idempotent fixture, verified customer and unpaid-download protection passed.');
}finally{rmSync(dir,{recursive:true,force:true});}

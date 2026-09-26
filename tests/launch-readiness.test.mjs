import assert from "node:assert/strict";
import { buildLaunchReadiness } from "../lib/launch-readiness.ts";

const now=new Date("2026-09-26T12:00:00.000Z");
const base={
  stripe:{keyConfigured:true,webhookConfigured:true,mode:"test",operationalMode:"test",liveEnabled:false,businessCallsAllowed:true,siteOrigin:"https://meshharbor3d.com",secureOrigin:true,checkoutReady:true,productionReady:false},
  shipping:{configured:true,credentialMode:"test",mode:"test",liveEnabled:false,businessCallsAllowed:true,readiness:"test-ready",fromAddressConfigured:true,webhookSecretConfigured:true,autoBuyLabels:false},
  shippingOrigin:{name:"Mesh Harbor 3D",street1:"100 Test Way",street2:"",city:"Monroe",state:"NC",zip:"28110",country:"US"},
  pickup:{enabled:true,locationName:"Mesh Harbor 3D Local Pickup",publicArea:"Monroe, NC",street1:"100 Test Way",street2:"",city:"Monroe",state:"NC",zip:"28110",country:"US",instructions:"Private.",weekdays:[1,2,3,4,5],startTime:"17:30",endTime:"20:00",slotMinutes:30,bookingWindowDays:14,minimumLeadHours:2},
  backups:[{name:"backup.zip",createdAt:"2026-09-26T10:00:00.000Z",databaseBytes:1000,includesPrivateFiles:true}],
  security:{twoFactorEnabled:true,recoveryCodesRemaining:8},
  followUps:{deploymentEnabled:true,ownerEnabled:true,due:0,deferred:0,sentLast7Days:0,failed:0,failedRequests:[]},
  policyVersion:"2026-09-26-v1",
  now,
};

{
  const report=buildLaunchReadiness(base);
  assert.equal(report.operatingMode,"sandbox");
  assert.equal(report.liveCommerceReady,false);
  assert.equal(report.items.find(x=>x.id==="stripe")?.status,"attention");
  assert.equal(report.items.find(x=>x.id==="auto-buy")?.status,"ready");
  assert.equal(report.items.find(x=>x.id==="https")?.status,"ready");
}

{
  const report=buildLaunchReadiness({...base,stripe:{...base.stripe,mode:"live",operationalMode:"live",liveEnabled:true,businessCallsAllowed:true,productionReady:true},shipping:{...base.shipping,credentialMode:"production",mode:"production",liveEnabled:true,readiness:"production-ready"}});
  assert.equal(report.operatingMode,"live-ready");
  assert.equal(report.liveCommerceReady,true);
  assert.equal(report.items.find(x=>x.id==="live-commerce")?.status,"ready");
}

{
  const report=buildLaunchReadiness({...base,stripe:{...base.stripe,mode:"live",operationalMode:"live-locked",liveEnabled:false,businessCallsAllowed:false,checkoutReady:false,productionReady:false}});
  assert.equal(report.liveCommerceReady,false);
  assert.equal(report.items.find(x=>x.id==="stripe")?.status,"attention");
  assert.match(report.items.find(x=>x.id==="stripe")?.detail||"",/STRIPE_LIVE_ENABLED/);
}

{
  const report=buildLaunchReadiness({...base,shipping:{...base.shipping,autoBuyLabels:true}});
  assert.equal(report.items.find(x=>x.id==="auto-buy")?.status,"attention");
}

{
  const report=buildLaunchReadiness({...base,stripe:{...base.stripe,siteOrigin:"http://example.test",secureOrigin:false,checkoutReady:false}});
  assert.equal(report.items.find(x=>x.id==="https")?.status,"blocked");
  assert.equal(report.liveCommerceReady,false);
}

{
  const report=buildLaunchReadiness({...base,backups:[]});
  assert.equal(report.items.find(x=>x.id==="backups")?.status,"blocked");
}

console.log("Launch readiness tests passed.");

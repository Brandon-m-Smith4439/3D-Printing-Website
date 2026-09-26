import assert from "node:assert/strict";
import { classifyStripeCredential, resolveStripeOperationalMode, stripeBusinessCallsAllowed } from "../lib/stripe-mode.ts";
import { evaluateFulfillmentRelease, shipmentHasUsableLabel } from "../lib/fulfillment-release.ts";

assert.equal(classifyStripeCredential("sk_test_example"), "test");
assert.equal(classifyStripeCredential("rk_live_example"), "live");
assert.equal(classifyStripeCredential(""), "unconfigured");

assert.equal(resolveStripeOperationalMode("sk_test_example", false), "test");
assert.equal(resolveStripeOperationalMode("sk_live_example", false), "live-locked");
assert.equal(resolveStripeOperationalMode("sk_live_example", true), "live");
assert.equal(stripeBusinessCallsAllowed("test"), true);
assert.equal(stripeBusinessCallsAllowed("live"), true);
assert.equal(stripeBusinessCallsAllowed("live-locked"), false);

const shippingBase={
  hasQuote:true,
  fulfillmentMode:"shipping",
  depositSatisfied:true,
  jobStatus:"ready",
  finalBalancePaid:true,
  shippingSelected:true,
  trackingCode:"",
  shipmentStatus:"not_created",
  refundStatus:"",
  pickupScheduled:false,
};

{
  const release=evaluateFulfillmentRelease(shippingBase);
  assert.equal(release.canBuyShippingLabel,true);
  assert.equal(release.canComplete,false);
  assert.equal(release.checks.find(item=>item.id==="fulfillment")?.status,"attention");
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,trackingCode:"9400TEST",shipmentStatus:"pre_transit"});
  assert.equal(shipmentHasUsableLabel({...shippingBase,trackingCode:"9400TEST",shipmentStatus:"pre_transit"}),true);
  assert.equal(release.canBuyShippingLabel,false);
  assert.equal(release.canComplete,true);
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,trackingCode:"9400TEST",shipmentStatus:"refunded",refundStatus:"refunded"});
  assert.equal(release.canBuyShippingLabel,true);
  assert.equal(release.canComplete,false);
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,trackingCode:"9400TEST",shipmentStatus:"return_to_sender"});
  assert.equal(release.canComplete,false);
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,trackingCode:"9400TEST",shipmentStatus:"failure"});
  assert.equal(release.canComplete,false);
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,jobStatus:"printing"});
  assert.equal(release.canBuyShippingLabel,false);
  assert.equal(release.canComplete,false);
}
{
  const release=evaluateFulfillmentRelease({...shippingBase,fulfillmentMode:"pickup",shippingSelected:false,pickupScheduled:false});
  assert.equal(release.canComplete,true);
  assert.equal(release.checks.find(item=>item.id==="fulfillment")?.status,"attention");
}

console.log("Commerce gate tests passed.");

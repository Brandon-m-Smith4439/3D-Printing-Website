import assert from "node:assert/strict";
import fs from "node:fs";

const labelRoute=fs.readFileSync("app/api/owner/requests/[id]/shipping-label/route.ts","utf8");
const shippingService=fs.readFileSync("lib/shipping-service.ts","utf8");
const queueRoute=fs.readFileSync("app/api/owner/queue/[id]/route.ts","utf8");
const stripeCheckout=fs.readFileSync("lib/stripe-checkout.ts","utf8");
const finalInvoice=fs.readFileSync("lib/final-invoice-service.ts","utf8");

assert.match(labelRoute,/confirmPurchase:\s*z\.literal\(true\)/,"shipping label purchases must require explicit owner confirmation");
assert.match(labelRoute,/confirmRateChange/,"changed-rate purchases must carry a separate confirmation");
assert.match(shippingService,/job\.status !== "ready"/,"server must require Ready before a new label purchase");
assert.match(shippingService,/Automatic label purchase is blocked in v0\.94/,"automatic production label purchase must stay disabled");
assert.match(queueRoute,/evaluateFulfillmentRelease/,"completion route must enforce fulfillment release policy");
assert.match(stripeCheckout,/assertStripeNewCommerceAllowed\(\)/,"deposit checkout must enforce the live Stripe gate");
assert.match(finalInvoice,/assertStripeNewCommerceAllowed\(\)/,"new final invoices must enforce the live Stripe gate");

console.log("Payment and shipping hardening source checks passed.");

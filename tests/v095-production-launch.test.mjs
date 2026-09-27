import assert from "node:assert/strict";
import fs from "node:fs";

const quoteTypes=fs.readFileSync("lib/quote-types.ts","utf8");
const stripeCheckout=fs.readFileSync("lib/stripe-checkout.ts","utf8");
const finalInvoice=fs.readFileSync("lib/final-invoice-service.ts","utf8");
const checkoutRoute=fs.readFileSync("app/api/account/quotes/[id]/checkout/route.ts","utf8");
const manualRoute=fs.readFileSync("app/api/owner/requests/[id]/manual-payment/route.ts","utf8");
const queueStore=fs.readFileSync("lib/queue-store.ts","utf8");
const requestSchema=fs.readFileSync("lib/request-schema.ts","utf8");
const loginRoute=fs.readFileSync("app/api/account/login/route.ts","utf8");
const loginVerify=fs.readFileSync("app/api/account/login/verify/route.ts","utf8");
const settings2fa=fs.readFileSync("app/api/account/settings/2fa/route.ts","utf8");
const header=fs.readFileSync("components/HeaderNav.tsx","utf8");
const site=fs.readFileSync("lib/site.ts","utf8");

for(const method of ["cash","zelle","cash-app","apple-cash","venmo","paypal"]){
  assert.match(quoteTypes,new RegExp('"' + method.replace("-","\\-") + '"'),`local payment method missing: ${method}`);
}
assert.match(quoteTypes,/paymentMethod === "cash" && value\.fulfillmentMode !== "pickup"/,"local/manual payments must be pickup-only");
assert.match(checkoutRoute,/quote\.paymentMethod==="cash"/,"local/manual payment quotes must not enter Stripe Checkout");
assert.match(manualRoute,/requestIsOwner/,"manual payment confirmation must require owner auth");
assert.match(manualRoute,/Mark production Ready before recording the final local payment/,"manual final payment must be gated by Ready status");

assert.match(stripeCheckout,/automatic_tax\]\[enabled\]", "true"/,"Stripe Checkout must enable automatic tax");
assert.match(stripeCheckout,/txcd_99999999/,"Stripe Checkout must classify custom prints as tangible goods");
assert.match(stripeCheckout,/billing_address_collection", "required"/,"Stripe Checkout must collect tax location");
assert.match(finalInvoice,/automatic_tax:\s*\{ enabled: true \}/,"final Stripe invoices must enable automatic tax");
assert.match(finalInvoice,/tax_code:\s*"txcd_99999999"/,"final Stripe invoices must carry the tangible-goods tax code");

assert.match(requestSchema,/isAnonymous:\s*z\.boolean/,"custom requests must accept the private-print flag");
assert.match(queueStore,/publicTitle:\s*isAnonymous \? "Private print"/,"public queue must redact private print titles");
assert.match(queueStore,/estimatedReadyDate:\s*isAnonymous \? ""/,"public queue must redact private print dates");
assert.match(queueStore,/publicCode:\s*isAnonymous \? ""/,"public queue must redact private request codes");

assert.match(loginRoute,/createCustomerLoginChallenge/,"customer login must support optional two-factor challenges");
assert.match(loginVerify,/consumeCustomerLoginChallenge/,"customer two-factor verification route must consume one-time codes");
assert.match(settings2fa,/setCustomerEmailTwoFactor/,"account settings must support enabling or disabling email 2FA");

assert.match(header,/site\.whatnotUrl \|\| site\.etsyUrl/,"marketplace navigation must disappear when no shop URLs are configured");
assert.match(site,/contactEmail:\s*"notifications@meshharbor3d\.com"/,"default public contact must use the Mesh Harbor 3D domain");

console.log("V0.95 production launch source checks passed.");

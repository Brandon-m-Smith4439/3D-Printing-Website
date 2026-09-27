import assert from "node:assert/strict";
import fs from "node:fs";

const guestAccess=fs.readFileSync("lib/guest-access.ts","utf8");
const notifications=fs.readFileSync("lib/customer-notifications.ts","utf8");
const followupPolicy=fs.readFileSync("lib/customer-follow-up-policy.ts","utf8");
const quoteRoute=fs.readFileSync("app/api/owner/requests/[id]/quote/route.ts","utf8");
const inPerson=fs.readFileSync("app/api/owner/requests/[id]/quote-approve-in-person/route.ts","utf8");
const portal=fs.readFileSync("components/GuestRequestPortal.tsx","utf8");
const editor=fs.readFileSync("components/OwnerQuoteEditor.tsx","utf8");
const costPanel=fs.readFileSync("components/OwnerQuoteCostPanel.tsx","utf8");
const header=fs.readFileSync("components/HeaderNav.tsx","utf8");
const footer=fs.readFileSync("components/Footer.tsx","utf8");
const site=fs.readFileSync("lib/site.ts","utf8");

assert.match(guestAccess,/createHmac\("sha256"/,"guest links must be signed");
assert.match(guestAccess,/httpOnly:\s*true/,"guest session must use HttpOnly cookie");
assert.match(guestAccess,/account\?\.emailVerifiedAt/,"verified accounts must supersede guest access");
assert.match(notifications,/guestAccessUrl\(request\)/,"guest emails must include secure request links");
assert.match(notifications,/forceEmail/,"transactional guest emails must support forced delivery");
assert.doesNotMatch(followupPolicy,/Request is not linked to a customer account/,"guest reminders must not require an account");

assert.match(quoteRoute,/source\.source!=="owner".*parsed\.data\.fulfillmentMode!==source\.fulfillmentMethod/s,"customer fulfillment must be server-locked");
assert.match(quoteRoute,/Complete Cost & Margin before sending the quote/,"sent quotes must require costing");
assert.match(quoteRoute,/automaticReadyDate/,"ready date must be recomputed server-side");
assert.match(inPerson,/source\.source!=="owner"/,"in-person quote approval must be limited to owner-created requests");

assert.ok(portal.includes("onClick={()=>void approve()}"),"guest portal missing approve action");
assert.ok(portal.includes('respond("counter")'),"guest portal missing counter action");
assert.ok(portal.includes('respond("decline")'),"guest portal missing decline action");
assert.match(portal,/CustomerShippingSelector/,"guest portal must support shipping rates");
assert.match(portal,/CustomerPickupScheduler/,"guest portal must support pickup scheduling");

assert.match(costPanel,/Target contribution margin/,"Cost & Margin must be primary quote control");
assert.match(costPanel,/targetMarginBasisPoints/,"quote margin slider must drive per-quote target");
assert.match(costPanel,/Pre-processing hours/,"pre-processing input missing");
assert.match(costPanel,/Post-processing hours/,"post-processing input missing");
assert.match(costPanel,/Print time \/ machine hours/,"print-time input missing");
assert.match(costPanel,/Spool\/refill packaging is intentionally hidden/,"quote material selection must hide spool/refill distinction");
assert.match(editor,/Customer Approved In Person/,"owner quote UI must expose in-person approval");
assert.match(editor,/request\.source!=="owner"/,"customer fulfillment controls must be locked in owner UI");

assert.doesNotMatch(header,/Whatnot shop/,"public header must not show Whatnot");
assert.doesNotMatch(footer,/Whatnot Shop/,"public footer must not show Whatnot");
assert.match(site,/101 S Charlotte Ave/,"designated pickup address must be configured");
assert.match(site,/764 W Franklin St/,"private shipping origin default must be configured");
console.log("V0.96 guest quote and pricing source checks passed.");

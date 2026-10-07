import assert from "node:assert/strict";
import fs from "node:fs";

const requestForm = fs.readFileSync("components/CustomRequestForm.tsx", "utf8");
const owner = fs.readFileSync("components/OwnerQueueManager.tsx", "utf8");
const ownerRoute = fs.readFileSync("app/api/owner/requests/route.ts", "utf8");
const requestSchema = fs.readFileSync("lib/request-schema.ts", "utf8");
const choiceRoute = fs.readFileSync("app/api/owner/requests/[id]/choices/route.ts", "utf8");
const site = fs.readFileSync("lib/site.ts", "utf8");
const siteStore = fs.readFileSync("lib/site-content-store.ts", "utf8");
const fulfillment = fs.readFileSync("app/fulfillment/page.tsx", "utf8");
const operations = fs.readFileSync("components/OwnerOperationsCenter.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.doesNotMatch(requestForm, /option value="local-delivery"/, "public request form must not offer local delivery");
assert.match(requestForm, /Cash \(Local pickup only\)/, "pickup-only payment choices should remain visible");
assert.match(requestForm, /disabled=\{summary\.fulfillmentMethod!=="pickup"\}/, "pickup-only payment choices must disable for shipping");
assert.doesNotMatch(requestSchema, /z\.enum\(\["pickup", "shipping", "local-delivery"/, "new customer requests must reject local delivery");
assert.doesNotMatch(choiceRoute, /local-delivery/, "owner choice confirmation must not create local delivery");

assert.match(owner, />Owner Custom Request<\/button>/, "owner must have a dedicated Owner Custom Request action");
assert.doesNotMatch(owner, /Add Etsy, Whatnot, repeat, or in-person job/, "legacy Etsy/manual queue creator must be removed");
assert.doesNotMatch(owner, /function ManualQueueForm/, "manual queue creation should no longer be a second request system");
assert.match(owner, /filter\(item=>item\.count>0\)/, "zero-count production filters must be hidden");
assert.match(owner, /Cash \(Local pickup only\)/, "owner request form should explain pickup-only payments");
assert.doesNotMatch(owner, /option value="local-delivery"/, "owner request creation must not offer local delivery");

assert.match(ownerRoute, /findCustomerByEmail/, "owner-created requests should discover existing customer accounts");
assert.match(ownerRoute, /matchingAccount\?\.emailVerifiedAt/, "only verified matching accounts should link immediately");
assert.match(ownerRoute, /notifyCustomer/, "owner-created requests with email should send a secure tracking notification");

assert.match(site, /316 W Jefferson St/, "designated pickup street must be configured");
assert.match(site, /28112-4714/, "designated pickup ZIP+4 must be configured");
assert.match(siteStore, /101 S Charlotte Ave/, "legacy pickup address should be migrated");
assert.match(siteStore, /legacyPickupDefault/, "pickup migration should target the known old default only");

assert.doesNotMatch(fulfillment, /<h2>Local delivery<\/h2>/, "fulfillment policy must not advertise local delivery");
assert.equal(pkg.version, "1.0.0");
assert.match(operations, /label: "Needs attention"/);
assert.match(operations, /label: "New requests"/);
assert.match(operations, /label: "Active production"/);
assert.match(operations, /label: "Final balances"/);
assert.doesNotMatch(operations, /label: "Completed"/, "completed work is not a primary dashboard KPI");

console.log("V0.98 fulfillment, pickup, owner request, filter, and dashboard source checks passed.");

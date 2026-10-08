import assert from "node:assert/strict";
import fs from "node:fs";

const tracking = fs.readFileSync("lib/owner-tracking-status.ts", "utf8");
const requestTypes = fs.readFileSync("lib/request-types.ts", "utf8");
const requestStore = fs.readFileSync("lib/request-store.ts", "utf8");
const owner = fs.readFileSync("components/OwnerQueueManager.tsx", "utf8");
const createRoute = fs.readFileSync("app/api/owner/requests/route.ts", "utf8");
const updateRoute = fs.readFileSync("app/api/owner/requests/[id]/route.ts", "utf8");
const queueRoute = fs.readFileSync("app/api/owner/queue/[id]/route.ts", "utf8");
const accountRequests = fs.readFileSync("app/api/account/requests/route.ts", "utf8");
const profile = fs.readFileSync("components/ProfileDashboard.tsx", "utf8");
const guest = fs.readFileSync("components/GuestRequestPortal.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

for (const status of ["new","reviewing","quoted","accepted","deposit-paid","queued","preparing","printing","finishing","ready","on-hold","completed","declined"]) {
  assert.ok(tracking.includes('"' + status + '"'), "Owner tracking must include " + status);
}
assert.match(requestTypes, /ownerTrackingStatus\?: OwnerTrackingStatus/, "Stored requests must persist an owner tracking stage");
assert.match(requestStore, /ownerTrackingStatus: values\.ownerTrackingStatus/, "Owner-created requests must persist their selected tracking stage");
assert.match(owner, /aria-label="Owner tracking status"/, "Production cards must allow editing owner tracking after creation");
assert.match(owner, /ownerTrackingStatuses\.map/, "Owner Custom Request must offer the full tracking list");
assert.match(owner, /ownerTrackingStatus:currentStatus/, "Owner Custom Request must submit the selected tracking stage");
assert.match(owner, /formal production queue status/i, "Formal queue controls must remain separate from owner tracking");
assert.match(owner, /tracking===status\.slice\(4\)/, "Production filters must count manually tracked production stages");
assert.match(createRoute, /ownerTrackingStatus: z\.enum\(ownerTrackingStatuses\)/, "Owner request creation API must accept all owner tracking stages");
assert.match(updateRoute, /ownerTrackingStatus: z\.enum\(ownerTrackingStatuses\)/, "Owner request update API must accept owner tracking changes");
assert.match(updateRoute, /No payment, quote, or queue record was created by this tracking update/, "Tracking updates must remain separate from financial and queue records");
assert.match(queueRoute, /ownerTrackingStatus:"completed"/, "Formal queue completion should keep owner tracking synchronized");
assert.match(accountRequests, /ownerTrackingStatus: item\.ownerTrackingStatus \|\| null/, "Customer account request payloads must expose owner tracking");
assert.match(profile, /ownerTrackingStatusLabels\[request\.ownerTrackingStatus\]/, "Customer profile must show owner tracking status");
assert.match(guest, /ownerTrackingStatusLabels\[request\.ownerTrackingStatus\]/, "Guest request portal must show owner tracking status");
assert.match(css, /v1\.02 — editable Owner Custom Request tracking/, "v1.02 tracking controls must have dedicated styling");
assert.equal(pkg.version, "1.2.0");

console.log("v1.02 full owner tracking creation/editing checks passed.");

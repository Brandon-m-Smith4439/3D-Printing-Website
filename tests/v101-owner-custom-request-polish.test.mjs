import assert from "node:assert/strict";
import fs from "node:fs";

const owner = fs.readFileSync("components/OwnerQueueManager.tsx", "utf8");
const route = fs.readFileSync("app/api/owner/requests/route.ts", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(owner, /currentStatus,setCurrentStatus/, "Owner Custom Request must track a starting request status");
assert.match(owner, /New — awaiting review/, "Owner status selector must offer New");
assert.match(owner, /Reviewing — scoping \/ planning/, "Owner status selector must offer Reviewing");
assert.match(owner, /status:currentStatus/, "Owner Custom Request must submit the selected status");
assert.match(owner, /displayedStatus=historical\?"Completed history"/, "Historical requests must visibly report Completed history");
assert.match(owner, /owner-custom-request-stage-strip/, "Owner Custom Request needs a visible workflow strip");
assert.match(owner, /owner-custom-request-section-heading/, "Owner Custom Request must use styled section headings");
assert.match(owner, /Customer & project/, "Owner Custom Request must group customer/project fields");
assert.match(owner, /Fulfillment & job details/, "Owner Custom Request must group fulfillment fields");
assert.match(owner, /Print details/, "Owner Custom Request must group print fields");
assert.match(owner, /Request brief & owner notes/, "Owner Custom Request must separate request and private notes");

assert.match(route, /status: z\.enum\(\["new","reviewing"\]\)/, "Owner request API must validate allowed starting statuses");
assert.match(route, /status: historicalCompleted \? "completed" : parsed\.data\.status/, "API must preserve historical completed status and selected live status");

assert.match(css, /v1\.01 — Owner Custom Request visual system \+ starting status/, "v1.01 visual system styles must exist");
assert.match(css, /\.owner-custom-request-section\s*\{/, "Owner form sections need glass-card styling");
assert.match(css, /\.owner-custom-request-status\s*\{/, "Current status needs a visible status badge");
assert.match(css, /\.owner-custom-request-stage-strip\s*\{/, "Workflow stage strip needs dedicated styling");
assert.match(css, /\.owner-custom-request-form input:not\(\[type="checkbox"\]\)/, "Text inputs must use dedicated site-matched styling");
assert.match(css, /@media\(max-width:720px\)[\s\S]*\.owner-custom-request-form \.owner-custom-request-fields[\s\S]*grid-template-columns:1fr/, "Owner form sections must collapse cleanly on mobile");

assert.equal(pkg.version, "1.2.0");

console.log("v1.01 Owner Custom Request polish and starting-status checks passed.");

import assert from "node:assert/strict";
import fs from "node:fs";

const owner = fs.readFileSync("components/OwnerQueueManager.tsx", "utf8");
const requestForm = fs.readFileSync("components/CustomRequestForm.tsx", "utf8");
const operations = fs.readFileSync("components/OwnerOperationsCenter.tsx", "utf8");
const ownerRoute = fs.readFileSync("app/api/owner/requests/route.ts", "utf8");
const profitability = fs.readFileSync("lib/profitability-report.ts", "utf8");
const profitOps = fs.readFileSync("lib/owner-profitability-operations.ts", "utf8");
const historicalStore = fs.readFileSync("lib/historical-profit-store.ts", "utf8");
const pricing = fs.readFileSync("components/OwnerPricingPanel.tsx", "utf8");
const database = fs.readFileSync("lib/database.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

assert.match(owner, /aria-label="Search production requests"/, "Production page needs a request search field");
assert.match(owner, /function matchesSearch/, "Production search must filter request records");
assert.match(owner, /normalizedSearch\?"all"/, "Production search must search across status filters");

assert.match(operations, /actionableAttention = snapshot\.attention\.filter/, "Dashboard attention must separate actionable work from passive watches");
assert.match(operations, /item\.severity === "urgent" \|\| item\.severity === "action"/, "Needs Attention must contain only urgent/action items");
assert.match(operations, /COST VS PROFIT/, "Dashboard must show cost vs profit");
assert.match(operations, /Current cost/, "Dashboard active profitability must expose current cost");
assert.match(operations, /Completed · all time/, "Dashboard must include all-time completed profitability");

assert.match(owner, /Historical \/ already completed request/, "Owner request creation needs a historical mode");
assert.match(owner, /historicalRevenueCents/, "Historical request must submit revenue");
assert.match(owner, /historicalDirectCostCents/, "Historical request must submit direct cost");
assert.match(owner, /Historical bookkeeping/i, "Historical order details must show bookkeeping metrics");
assert.match(ownerRoute, /saveHistoricalProfitRecord/, "Owner historical creation must persist profit data");
assert.match(ownerRoute, /stored\.email && !historicalCompleted/, "Historical backfill must not email the customer");
assert.match(ownerRoute, /const ownerTrackingStatus = historicalCompleted \? "completed"/, "Historical jobs must keep completed tracking while live owner requests use their selected tracking stage");

assert.match(profitability, /historicalByRequest/, "Profitability report must read historical records");
assert.match(profitability, /historical\?\.completedAt/, "Historical completion date must drive date ranges");
assert.match(profitOps, /range: 'all'/, "Dashboard completed profitability must be all-time");
assert.match(historicalStore, /contributionProfitCents = revenueCents - directCostCents/, "Historical profit must be computed from revenue and direct cost");
assert.match(database, /"historical-profit-records"/, "Historical profit collection must be registered");

assert.match(requestForm, /summary\.fulfillmentMethod==="pickup"\?"Cash":"Cash \(Local pickup only\)"/, "Public pickup labels must remove the pickup-only suffix when pickup is selected");
assert.match(owner, /fulfillment==="pickup"\?"Cash":"Cash \(Local pickup only\)"/, "Owner pickup labels must remove the pickup-only suffix when pickup is selected");

assert.match(pricing, /\["7d","30d","90d","all"\]/, "Pricing profitability needs selectable time ranges");
assert.match(pricing, /All time/, "Pricing profitability must expose an all-time range");
assert.equal(pkg.version, "1.2.0");

console.log("V0.99 production search, actionable dashboard, historical profitability, and payment-label checks passed.");

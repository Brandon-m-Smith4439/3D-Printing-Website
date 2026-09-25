import assert from "node:assert/strict";
import {
  classifyEasyPostCredential,
  easyPostBusinessCallsAllowed,
  resolveEasyPostOperationalMode,
} from "../lib/easypost-mode.ts";

assert.equal(classifyEasyPostCredential(""), "unconfigured");
assert.equal(classifyEasyPostCredential("replace-with-key"), "unconfigured");
assert.equal(classifyEasyPostCredential("EZTK_test_123"), "test");
assert.equal(classifyEasyPostCredential("EZAK_prod_123"), "production");

assert.equal(resolveEasyPostOperationalMode("EZTK_test_123", false), "test");
assert.equal(resolveEasyPostOperationalMode("EZAK_prod_123", false), "production-locked");
assert.equal(resolveEasyPostOperationalMode("EZAK_prod_123", true), "production");
assert.equal(resolveEasyPostOperationalMode("", true), "unconfigured");

assert.equal(easyPostBusinessCallsAllowed("unconfigured"), false);
assert.equal(easyPostBusinessCallsAllowed("production-locked"), false);
assert.equal(easyPostBusinessCallsAllowed("test"), true);
assert.equal(easyPostBusinessCallsAllowed("production"), true);

console.log("EasyPost mode policy checks passed.");

import { summarizeEasyPostWebhooks } from "../lib/easypost-mode.ts";

assert.deepEqual(
  summarizeEasyPostWebhooks("https://meshharbor3d.com/api/shipping/easypost/webhook", [
    { url: "https://meshharbor3d.com/api/shipping/easypost/webhook", disabled_at: null },
  ]),
  { webhookFound: true, webhookDisabled: false },
);
assert.deepEqual(
  summarizeEasyPostWebhooks("https://meshharbor3d.com/api/shipping/easypost/webhook", [
    { url: "https://meshharbor3d.com/api/shipping/easypost/webhook", disabled_at: "2026-09-25T00:00:00Z" },
  ]),
  { webhookFound: true, webhookDisabled: true },
);
assert.deepEqual(
  summarizeEasyPostWebhooks("https://meshharbor3d.com/api/shipping/easypost/webhook", [
    { url: "https://example.com/other", disabled_at: null },
  ]),
  { webhookFound: false, webhookDisabled: false },
);

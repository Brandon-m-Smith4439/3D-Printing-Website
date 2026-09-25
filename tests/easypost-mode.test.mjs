import assert from "node:assert/strict";
import {
  classifyEasyPostCredential,
  easyPostBusinessCallsAllowed,
  easyPostDiagnosticNoticeKind,
  easyPostReadinessPresentation,
  resolveEasyPostOperationalMode,
  summarizeEasyPostWebhooks,
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

assert.deepEqual(easyPostReadinessPresentation("test-ready"), {
  tone: "good",
  label: "EasyPost test ready",
  detail: "Rates, test labels, refunds, and tracking can be validated safely; live shipping remains off.",
});
assert.deepEqual(easyPostReadinessPresentation("production-locked"), {
  tone: "warning",
  label: "EasyPost live key locked",
  detail: "A production key is installed, but real rates and labels are blocked until live shipping is deliberately enabled.",
});

assert.equal(easyPostDiagnosticNoticeKind({ connected: false, webhookFound: false, webhookDisabled: false }), "error");
assert.equal(easyPostDiagnosticNoticeKind({ connected: true, webhookFound: false, webhookDisabled: false }), "warning");
assert.equal(easyPostDiagnosticNoticeKind({ connected: true, webhookFound: true, webhookDisabled: true }), "warning");
assert.equal(easyPostDiagnosticNoticeKind({ connected: true, webhookFound: true, webhookDisabled: false }), "success");

console.log("EasyPost mode policy checks passed.");

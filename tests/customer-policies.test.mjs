import assert from "node:assert/strict";
import { CUSTOMER_POLICY_VERSION, customerPolicyAcceptanceSchema } from "../lib/customer-policies.ts";

assert.equal(customerPolicyAcceptanceSchema.safeParse({accepted:true,policyVersion:CUSTOMER_POLICY_VERSION}).success, true);
assert.equal(customerPolicyAcceptanceSchema.safeParse({accepted:false,policyVersion:CUSTOMER_POLICY_VERSION}).success, false);
assert.equal(customerPolicyAcceptanceSchema.safeParse({accepted:true,policyVersion:"old-policy"}).success, false);
assert.equal(customerPolicyAcceptanceSchema.safeParse({policyVersion:CUSTOMER_POLICY_VERSION}).success, false);
assert.equal(customerPolicyAcceptanceSchema.safeParse({accepted:true,policyVersion:CUSTOMER_POLICY_VERSION,extra:"nope"}).success, false);
console.log("Customer policy acceptance tests passed.");

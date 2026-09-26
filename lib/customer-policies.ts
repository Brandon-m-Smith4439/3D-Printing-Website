import { z } from "zod";

export const CUSTOMER_POLICY_VERSION = "2026-09-26-v1";
export const CUSTOMER_POLICY_EFFECTIVE_DATE = "September 26, 2026";

export const customerPolicyAcceptanceSchema = z.object({
  accepted: z.literal(true),
  policyVersion: z.literal(CUSTOMER_POLICY_VERSION),
}).strict();

export type CustomerPolicyAcceptance = {
  version: string;
  acceptedAt: string;
  customerAccountId: string;
};

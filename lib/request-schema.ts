import { z } from "zod";
import { isFutureBusinessDate, normalizeBusinessDate } from "@/lib/business-date";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalPhone = z.string().trim().max(30).optional().default("").refine((value) => {
  if (!value) return true;
  if (!/^[0-9+() .-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}, { message: "Use a valid phone number with 7 to 15 digits and normal phone formatting." });
const neededByDate = z.string().trim().max(24).optional().default("")
  .refine((value) => value === "" || normalizeBusinessDate(value) !== null, { message: "Enter a valid date, such as 9/2/2026, or choose one from the calendar." })
  .refine((value) => value === "" || isFutureBusinessDate(value), { message: "Needed-by date must be after today." })
  .transform((value) => value === "" ? "" : normalizeBusinessDate(value) || "");
const attachmentClaim = z.object({ id: z.string().uuid(), token: z.string().min(20).max(256) });

export const customRequestSchema = z.object({
  name: trimmed(2, 80),
  email: z.string().trim().email("Enter a valid email address, such as name@example.com.").max(160),
  phone: optionalPhone,
  projectType: z.enum(["display", "functional", "replacement", "prototype", "other"]),
  modelStatus: z.enum(["ready", "needs-adjustment", "reference-only", "idea-only"]),
  fulfillmentMethod: z.enum(["pickup", "shipping", "local-delivery", "unsure"]),
  quantity: z.coerce.number().int().min(1).max(500),
  dimensions: z.string().trim().max(120).optional().default(""),
  materialPreference: z.enum(["no-preference", "pla", "petg", "asa", "tpu", "resin", "other"]),
  colorPreference: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(80).optional().default(""),
  neededBy: neededByDate,
  referenceUrl: z.union([z.literal(""), z.string().trim().url("Enter a complete web link.").max(500).refine((value) => {
    try { const protocol = new URL(value).protocol; return protocol === "http:" || protocol === "https:"; } catch { return false; }
  }, { message: "Reference links must use http:// or https://." })]).default(""),
  description: trimmed(20, 2500),
  attachments: z.array(attachmentClaim).max(3).optional().default([]),
  consent: z.literal(true, { error: "Please agree to be contacted about this request." }),
  website: z.string().trim().max(200).optional().default(""),
  turnstileToken: z.string().trim().max(2048).optional().default(""),
});

export type CustomRequest = z.infer<typeof customRequestSchema>;

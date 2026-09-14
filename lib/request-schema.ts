import { z } from "zod";

const trimmed = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const customRequestSchema = z.object({
  name: trimmed(2, 80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().default(""),
  projectType: z.enum(["display", "functional", "replacement", "prototype", "other"]),
  quantity: z.coerce.number().int().min(1).max(500),
  dimensions: z.string().trim().max(120).optional().default(""),
  materialPreference: z.enum(["no-preference", "pla", "petg", "asa", "tpu", "resin", "other"]),
  colorPreference: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(80).optional().default(""),
  neededBy: z.string().trim().max(40).optional().default(""),
  referenceUrl: z.union([z.literal(""), z.string().trim().url().max(500)]).default(""),
  description: trimmed(20, 2500),
  consent: z.literal(true),
  website: z.string().trim().max(200).optional().default(""),
  turnstileToken: z.string().trim().min(1).max(2048),
});

export type CustomRequest = z.infer<typeof customRequestSchema>;

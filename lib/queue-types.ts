import { z } from "zod";

export const queueStatuses = ["queued", "preparing", "printing", "finishing", "ready", "on-hold", "completed"] as const;
export type QueueStatus = (typeof queueStatuses)[number];

export const fulfillmentMethods = ["pickup", "shipping", "unsure"] as const;
export type QueueFulfillment = (typeof fulfillmentMethods)[number];

export type QueueJob = {
  id: string;
  sourceRequestId: string;
  publicCode: string;
  publicTitle: string;
  customerName: string;
  customerEmail: string;
  fulfillmentMethod: QueueFulfillment;
  quantity: number;
  status: QueueStatus;
  estimatedReadyDate: string;
  imageUrl: string;
  publicNote: string;
  privateNote: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  completionEmailSentAt: string;
};

export type PublicQueueJob = Pick<
  QueueJob,
  "publicCode" | "publicTitle" | "quantity" | "status" | "estimatedReadyDate" | "imageUrl" | "publicNote" | "sortOrder" | "createdAt"
>;

const optionalDate = z.string().trim().max(10).refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Invalid date.");
const localImage = z.string().trim().max(300).refine(
  (value) => value === "" || (value.startsWith("/") && !value.includes("..") && !value.includes("\\")),
  "Invalid image path.",
);

export const createQueueJobSchema = z.object({
  sourceRequestId: z.string().trim().max(100).optional().default(""),
  publicTitle: z.string().trim().min(2).max(100),
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().email().max(160),
  fulfillmentMethod: z.enum(fulfillmentMethods),
  quantity: z.coerce.number().int().min(1).max(500),
  estimatedReadyDate: optionalDate.default(""),
  imageUrl: localImage.optional().default(""),
  publicNote: z.string().trim().max(180).optional().default(""),
  privateNote: z.string().trim().max(1000).optional().default(""),
});

export const updateQueueJobSchema = z.object({
  publicTitle: z.string().trim().min(2).max(100).optional(),
  customerName: z.string().trim().min(2).max(100).optional(),
  customerEmail: z.string().trim().email().max(160).optional(),
  fulfillmentMethod: z.enum(fulfillmentMethods).optional(),
  quantity: z.coerce.number().int().min(1).max(500).optional(),
  status: z.enum(queueStatuses).optional(),
  estimatedReadyDate: optionalDate.optional(),
  imageUrl: localImage.optional(),
  publicNote: z.string().trim().max(180).optional(),
  privateNote: z.string().trim().max(1000).optional(),
});

import { z } from "zod";

export const requestStatuses = ["new", "reviewing", "quoted", "accepted", "deposit-paid", "declined", "queued", "completed"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export type RequestAttachment = {
  id: string;
  originalName: string;
  kind: "image" | "model";
  size: number;
  scanStatus: "clean" | "development-unscanned";
};

export type StoredRequest = {
  id: string;
  requestCode: string;
  status: RequestStatus;
  name: string;
  email: string;
  phone: string;
  projectType: string;
  modelStatus: string;
  fulfillmentMethod: "pickup" | "shipping" | "local-delivery" | "unsure";
  quantity: number;
  dimensions: string;
  materialPreference: string;
  colorPreference: string;
  budget: string;
  neededBy: string;
  neededBySubmitted?: string;
  referenceUrl: string;
  description: string;
  imageUrl: string;
  attachments?: RequestAttachment[];
  internalNote: string;
  createdAt: string;
  updatedAt: string;
  queuedAt: string;
  queueJobId: string;
  customerAccountId?: string;
  riskLevel?: "none" | "review";
  riskFlags?: string[];
};

export const updateStoredRequestSchema = z.object({ status: z.enum(requestStatuses) });
export const queueFromRequestSchema = z.object({}).strict();

import type { GalleryItem } from "./site";
import type { StoredRequest } from "./request-types";

export type RequestPrefill = {
  sourceType: "gallery" | "repeat";
  sourceLabel: string;
  sourceDetail: string;
  phone: string;
  projectType: "display" | "functional" | "replacement" | "prototype" | "other";
  modelStatus: "ready" | "needs-adjustment" | "reference-only" | "idea-only";
  fulfillmentMethod: "pickup" | "shipping" | "local-delivery" | "unsure";
  assemblyPreference: "assembled" | "disassembled" | "unsure";
  quantity: number;
  dimensions: string;
  materialPreference: "no-preference" | "pla" | "petg" | "asa" | "tpu" | "resin" | "other";
  colorPreference: string;
  referenceUrl: string;
  description: string;
};

const projectTypes = new Set(["display","functional","replacement","prototype","other"]);
const modelStatuses = new Set(["ready","needs-adjustment","reference-only","idea-only"]);
const fulfillmentMethods = new Set(["pickup","shipping","local-delivery","unsure"]);
const assemblyPreferences = new Set(["assembled","disassembled","unsure"]);
const materials = new Set(["no-preference","pla","petg","asa","tpu","resin","other"]);

function enumValue<T extends string>(value: string | undefined, allowed: Set<string>, fallback: T): T {
  return allowed.has(value || "") ? value as T : fallback;
}

function galleryProjectType(item: GalleryItem): RequestPrefill["projectType"] {
  const text = `${item.category} ${item.title} ${item.description}`.toLowerCase();
  if (text.includes("prototype")) return "prototype";
  if (text.includes("replacement")) return "replacement";
  if (text.includes("functional") || text.includes("organizer") || text.includes("stand") || text.includes("holder") || text.includes("adapter")) return "functional";
  return "display";
}

export function findRepeatRequestForCustomer(requests: StoredRequest[], requestId: string, customerId: string) {
  if (!requestId || !customerId) return null;
  return requests.find((item) => item.id === requestId && item.customerAccountId === customerId) || null;
}

export function prefillFromRequest(request: StoredRequest): RequestPrefill {
  return {
    sourceType: "repeat",
    sourceLabel: `Make another from ${request.requestCode}`,
    sourceDetail: "Project specifications were copied from your previous request. Review every field before submitting because pricing, availability, timing, and materials can change.",
    phone: request.phone || "",
    projectType: enumValue(request.projectType, projectTypes, "other"),
    modelStatus: enumValue(request.modelStatus, modelStatuses, "idea-only"),
    fulfillmentMethod: enumValue(request.fulfillmentMethod, fulfillmentMethods, "unsure"),
    assemblyPreference: enumValue(request.assemblyPreference, assemblyPreferences, "unsure"),
    quantity: Math.max(1, Math.min(500, Math.round(request.quantity || 1))),
    dimensions: request.dimensions || "",
    materialPreference: enumValue(request.materialPreference, materials, "no-preference"),
    colorPreference: request.colorPreference || "",
    referenceUrl: request.referenceUrl || "",
    description: request.description || `I would like another print based on ${request.requestCode}.`,
  };
}

export function prefillFromGallery(item: GalleryItem): RequestPrefill {
  return {
    sourceType: "gallery",
    sourceLabel: `Inspired by ${item.title}`,
    sourceDetail: "This starts a new custom request using the gallery project as a reference. You can change any specification before submitting.",
    phone: "",
    projectType: galleryProjectType(item),
    modelStatus: "reference-only",
    fulfillmentMethod: "unsure",
    assemblyPreference: "unsure",
    quantity: 1,
    dimensions: "",
    materialPreference: "no-preference",
    colorPreference: "",
    referenceUrl: "",
    description: `I would like a custom print inspired by "${item.title}". ${item.description} Please contact me about options for making this project my own.`,
  };
}

import { businessToday, normalizeBusinessDate } from "@/lib/business-date";
import type { StoredRequest } from "@/lib/request-types";

export type RequestPriority = {
  label: "Rush" | "High" | "Normal" | "Low";
  score: number;
  reason: string;
};

function daysBetween(startIso: string, endIso: string) {
  return Math.floor((Date.parse(`${endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000);
}

export function calculateRequestPriority(request: Pick<StoredRequest, "neededBy" | "createdAt">, today = businessToday()): RequestPriority {
  const submitted = request.createdAt.slice(0, 10);
  const ageDays = Math.max(0, daysBetween(submitted, today));
  const due = request.neededBy ? normalizeBusinessDate(request.neededBy) : "";
  const dueDays = due ? daysBetween(today, due) : null;

  let dueScore = 18;
  if (dueDays !== null) {
    if (dueDays <= 2) dueScore = 100;
    else if (dueDays <= 5) dueScore = 82;
    else if (dueDays <= 10) dueScore = 62;
    else if (dueDays <= 21) dueScore = 42;
    else dueScore = 24;
  }
  const ageBoost = Math.min(15, Math.floor(ageDays / 2));
  const score = dueScore + ageBoost;
  const label: RequestPriority["label"] = score >= 95 ? "Rush" : score >= 70 ? "High" : score >= 45 ? "Normal" : "Low";
  const reason = dueDays === null
    ? `${ageDays} day${ageDays === 1 ? "" : "s"} since submission; no due date supplied.`
    : `${dueDays <= 0 ? "Due now/past due" : `${dueDays} day${dueDays === 1 ? "" : "s"} until due`} • submitted ${ageDays} day${ageDays === 1 ? "" : "s"} ago.`;
  return { label, score, reason };
}

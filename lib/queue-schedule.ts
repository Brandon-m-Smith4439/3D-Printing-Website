import type { QueueJob } from "@/lib/queue-types";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function queueScheduleBoundary(jobs: QueueJob[], excludeSourceRequestId = "") {
  const active = jobs
    .filter((job) => job.status !== "completed")
    .filter((job) => !excludeSourceRequestId || job.sourceRequestId !== excludeSourceRequestId)
    .filter((job) => validDate(job.estimatedReadyDate))
    .sort((a, b) => a.estimatedReadyDate.localeCompare(b.estimatedReadyDate) || a.sortOrder - b.sortOrder);

  const latest = active.at(-1) || null;
  return latest
    ? { latestDate: latest.estimatedReadyDate, latestCode: latest.publicCode, activeDatedJobs: active.length }
    : { latestDate: "", latestCode: "", activeDatedJobs: 0 };
}

export function quoteWouldSkipQueue(jobs: QueueJob[], proposedDate: string, excludeSourceRequestId = "") {
  if (!validDate(proposedDate)) return false;
  const boundary = queueScheduleBoundary(jobs, excludeSourceRequestId);
  return Boolean(boundary.latestDate && proposedDate < boundary.latestDate);
}

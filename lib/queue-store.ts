import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { QueueJob, PublicQueueJob } from "@/lib/queue-types";
import type { z } from "zod";
import { createQueueJobSchema, updateQueueJobSchema } from "@/lib/queue-types";
import { readCollection, writeCollection } from "@/lib/database";

let mutationChain = Promise.resolve();

function normalizeJobs(rawJobs: QueueJob[]) {
  const activeByCreated = rawJobs
    .filter((job) => job.status !== "completed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const fallbackOrder = new Map(activeByCreated.map((job, index) => [job.id, index]));

  return rawJobs.map((job) => ({
    ...job,
    sourceRequestId: job.sourceRequestId || "",
    imageUrl: job.imageUrl || "",
    sortOrder: Number.isFinite(job.sortOrder) ? job.sortOrder : (fallbackOrder.get(job.id) ?? 9999),
  }));
}

export async function readQueue(): Promise<QueueJob[]> {
  return normalizeJobs(await readCollection<QueueJob>("queue"));
}

async function writeQueueNow(jobs: QueueJob[]) {
  await writeCollection("queue", jobs);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export function writeQueue(jobs: QueueJob[]) {
  return mutate(async () => {
    await writeQueueNow(jobs);
  });
}

function makePublicCode() {
  return `3D-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function normalizeSortOrders(jobs: QueueJob[]) {
  const active = jobs
    .filter((job) => job.status !== "completed")
    .sort((a, b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  active.forEach((job, index) => { job.sortOrder = index; });
}

export async function createQueueJob(values: z.infer<typeof createQueueJobSchema>) {
  return mutate(async () => {
    const jobs = await readQueue();
    const now = new Date().toISOString();
    const maxOrder = jobs.filter((job) => job.status !== "completed").reduce((max, job) => Math.max(max, job.sortOrder), -1);
    const job: QueueJob = {
      id: randomUUID(),
      sourceRequestId: values.sourceRequestId,
      publicCode: makePublicCode(),
      publicTitle: values.publicTitle,
      customerName: values.customerName,
      customerEmail: values.customerEmail,
      fulfillmentMethod: values.fulfillmentMethod,
      quantity: values.quantity,
      status: "queued",
      estimatedReadyDate: values.estimatedReadyDate,
      imageUrl: values.imageUrl,
      publicNote: values.publicNote,
      privateNote: values.privateNote,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      completionEmailSentAt: "",
    };
    jobs.push(job);
    normalizeSortOrders(jobs);
    await writeQueueNow(jobs);
    return job;
  });
}

export async function updateQueueJob(
  id: string,
  values: z.infer<typeof updateQueueJobSchema>,
  completionEmailSentAt?: string,
) {
  return mutate(async () => {
    const jobs = await readQueue();
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) return null;

    const existing = jobs[index];
    const now = new Date().toISOString();
    const nextStatus = values.status ?? existing.status;

    if (values.status === "printing") {
      for (const other of jobs) {
        if (other.id !== id && other.status === "printing") {
          other.status = "queued";
          other.updatedAt = now;
        }
      }
      existing.sortOrder = -1;
    }

    const next: QueueJob = {
      ...existing,
      ...values,
      updatedAt: now,
      completedAt: nextStatus === "completed" ? existing.completedAt || now : "",
      completionEmailSentAt: completionEmailSentAt ?? existing.completionEmailSentAt,
    };

    jobs[index] = next;
    normalizeSortOrders(jobs);
    await writeQueueNow(jobs);
    return next;
  });
}

export async function moveQueueJob(id: string, direction: "earlier" | "later") {
  return mutate(async () => {
    const jobs = await readQueue();
    const active = jobs
      .filter((job) => job.status !== "completed")
      .sort((a, b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const activeIndex = active.findIndex((job) => job.id === id);
    if (activeIndex < 0) return null;
    if (active[activeIndex].status === "printing" && direction === "later") return active[activeIndex];
    const swapIndex = direction === "earlier" ? activeIndex - 1 : activeIndex + 1;
    if (swapIndex < 0 || swapIndex >= active.length) return active[activeIndex];

    const current = active[activeIndex];
    const other = active[swapIndex];
    const currentOrder = current.sortOrder;
    current.sortOrder = other.sortOrder;
    other.sortOrder = currentOrder;
    normalizeSortOrders(jobs);
    await writeQueueNow(jobs);
    return current;
  });
}


export async function moveQueueJobToPosition(id: string, requestedPosition: number) {
  return mutate(async () => {
    const jobs = await readQueue();
    const active = jobs
      .filter((job) => job.status !== "completed")
      .sort((a, b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const currentIndex = active.findIndex((job) => job.id === id);
    if (currentIndex < 0) return null;
    const [current] = active.splice(currentIndex, 1);
    const hasPrinting = active.some((job) => job.status === "printing");
    const minimumIndex = current.status === "printing" ? 0 : hasPrinting ? 1 : 0;
    const maximumIndex = current.status === "printing" ? 0 : active.length;
    const targetIndex = Math.max(minimumIndex, Math.min(maximumIndex, Math.floor(requestedPosition) - 1));
    active.splice(targetIndex, 0, current);
    active.forEach((job, index) => { job.sortOrder = index; });
    await writeQueueNow(jobs);
    return current;
  });
}

export async function deleteQueueJob(id: string) {
  return mutate(async () => {
    const jobs = await readQueue();
    const filtered = jobs.filter((job) => job.id !== id);
    if (filtered.length === jobs.length) return false;
    normalizeSortOrders(filtered);
    await writeQueueNow(filtered);
    return true;
  });
}

function publicSort(a: QueueJob, b: QueueJob) {
  return (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

export async function getPublicQueue(): Promise<PublicQueueJob[]> {
  const jobs = await readQueue();
  return jobs
    .filter((job) => job.status !== "completed")
    .sort(publicSort)
    .map(({ publicCode, publicTitle, quantity, status, estimatedReadyDate, imageUrl, publicNote, sortOrder, createdAt }) => ({
      publicCode,
      publicTitle,
      quantity,
      status,
      estimatedReadyDate,
      imageUrl,
      publicNote,
      sortOrder,
      createdAt,
    }));
}

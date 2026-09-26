import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import type { PickupAppointment, PickupLocationSnapshot } from "@/lib/pickup-types";

let mutationChain = Promise.resolve();

async function writeAppointments(items: PickupAppointment[]) {
  await writeCollection("pickup-appointments", items);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function readPickupAppointments() {
  return readCollection<PickupAppointment>("pickup-appointments");
}

export async function activePickupForRequest(requestId: string) {
  const items = await readPickupAppointments();
  return items.find((item) => item.requestId === requestId && item.status === "scheduled") || null;
}

export async function schedulePickup(input: {
  requestId: string;
  quoteId: string;
  requestCode: string;
  customerAccountId: string;
  slotDate: string;
  slotTime: string;
  timeZone: string;
  location: PickupLocationSnapshot;
}) {
  return mutate(async () => {
    const items = await readPickupAppointments();
    const collision = items.some((item) => item.status === "scheduled" && item.slotDate === input.slotDate && item.slotTime === input.slotTime && item.requestId !== input.requestId);
    if (collision) return { appointment: null, conflict: true };
    const now = new Date().toISOString();
    const currentIndex = items.findIndex((item) => item.requestId === input.requestId && item.status === "scheduled");
    if (currentIndex >= 0) {
      items[currentIndex] = { ...items[currentIndex], ...input, updatedAt: now };
      await writeAppointments(items);
      return { appointment: items[currentIndex], conflict: false };
    }
    const appointment: PickupAppointment = {
      id: randomUUID(),
      ...input,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
      cancelledAt: "",
      completedAt: "",
    };
    items.push(appointment);
    await writeAppointments(items);
    return { appointment, conflict: false };
  });
}

export async function cancelPickup(requestId: string, customerAccountId?: string) {
  return mutate(async () => {
    const items = await readPickupAppointments();
    const index = items.findIndex((item) => item.requestId === requestId && item.status === "scheduled" && (!customerAccountId || item.customerAccountId === customerAccountId));
    if (index < 0) return null;
    const now = new Date().toISOString();
    items[index] = { ...items[index], status: "cancelled", cancelledAt: now, updatedAt: now };
    await writeAppointments(items);
    return items[index];
  });
}

export async function completePickup(appointmentId: string) {
  return mutate(async () => {
    const items = await readPickupAppointments();
    const index = items.findIndex((item) => item.id === appointmentId && item.status === "scheduled");
    if (index < 0) return null;
    const now = new Date().toISOString();
    items[index] = { ...items[index], status: "completed", completedAt: now, updatedAt: now };
    await writeAppointments(items);
    return items[index];
  });
}

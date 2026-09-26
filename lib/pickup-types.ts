import { z } from "zod";

export type PickupLocationSnapshot = {
  locationName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: "US";
  instructions: string;
};

export type PickupAppointmentStatus = "scheduled" | "cancelled" | "completed";

export type PickupAppointment = {
  id: string;
  requestId: string;
  quoteId: string;
  requestCode: string;
  customerAccountId: string;
  slotDate: string;
  slotTime: string;
  timeZone: string;
  status: PickupAppointmentStatus;
  location: PickupLocationSnapshot;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string;
  completedAt: string;
};

export type PickupSlot = {
  id: string;
  date: string;
  time: string;
  label: string;
};

export const pickupBookingSchema = z.object({
  slotId: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}\|([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid pickup time."),
});

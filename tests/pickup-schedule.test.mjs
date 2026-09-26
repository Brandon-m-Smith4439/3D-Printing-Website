import assert from "node:assert/strict";
import { availablePickupSlots, pickupSlotId } from "../lib/pickup-schedule.ts";

const settings = {
  enabled: true,
  locationName: "Mesh Harbor 3D Local Pickup",
  publicArea: "Monroe, NC",
  street1: "100 Test Ave",
  street2: "",
  city: "Monroe",
  state: "NC",
  zip: "28110",
  country: "US",
  instructions: "Test pickup.",
  weekdays: [1,2,3,4,5,6],
  startTime: "17:30",
  endTime: "19:00",
  slotMinutes: 30,
  bookingWindowDays: 7,
  minimumLeadHours: 2,
};

{
  const slots = availablePickupSlots({ ...settings, enabled:false }, [], "America/New_York", new Date("2026-09-25T16:00:00Z"));
  assert.equal(slots.length, 0, "disabled pickup must not expose slots");
}

{
  const slots = availablePickupSlots(settings, [], "America/New_York", new Date("2026-09-25T16:00:00Z"));
  assert.ok(slots.length > 0, "configured pickup should generate slots");
  assert.ok(slots.every((slot) => /^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/.test(slot.id)), "slot ids should be canonical");
  assert.ok(!slots.some((slot) => slot.date === "2026-09-27"), "Sunday must stay unavailable");
}

{
  const now = new Date("2026-09-25T16:00:00Z");
  const baseline = availablePickupSlots(settings, [], "America/New_York", now);
  assert.ok(baseline.length > 1);
  const blocked = baseline[0];
  const appointment = {
    id:"pickup-existing",requestId:"req-other",quoteId:"quote-other",requestCode:"REQ-OTHER",customerAccountId:"customer-other",
    slotDate:blocked.date,slotTime:blocked.time,timeZone:"America/New_York",status:"scheduled",
    location:{locationName:"Test",street1:"100 Test Ave",street2:"",city:"Monroe",state:"NC",zip:"28110",country:"US",instructions:""},
    createdAt:now.toISOString(),updatedAt:now.toISOString(),cancelledAt:"",completedAt:"",
  };
  const slots = availablePickupSlots(settings, [appointment], "America/New_York", now);
  assert.ok(!slots.some((slot) => slot.id === pickupSlotId(blocked.date, blocked.time)), "booked slots must be removed");
  const cancelled = { ...appointment, status:"cancelled" };
  const reopened = availablePickupSlots(settings, [cancelled], "America/New_York", now);
  assert.ok(reopened.some((slot) => slot.id === blocked.id), "cancelled appointments must release the slot");
}

{
  const strictLead = { ...settings, weekdays:[5], startTime:"12:00", endTime:"20:00", minimumLeadHours:4, bookingWindowDays:1 };
  const slots = availablePickupSlots(strictLead, [], "America/New_York", new Date("2026-09-25T16:00:00Z"));
  assert.ok(slots.every((slot) => slot.time >= "16:00" || slot.date > "2026-09-25"), "minimum lead time must remove near-term slots");
}

console.log("Pickup schedule tests passed.");

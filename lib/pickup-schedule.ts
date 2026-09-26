import type { PickupAppointment, PickupSlot } from "@/lib/pickup-types";
import type { PickupSettings } from "@/lib/site";

function businessWallParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute") };
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function pickupSlotId(date: string, time: string) {
  return `${date}|${time}`;
}

export function availablePickupSlots(settings: PickupSettings, appointments: PickupAppointment[], timeZone: string, now = new Date()): PickupSlot[] {
  if (!settings.enabled || !settings.street1 || !settings.city || !settings.state || !settings.zip) return [];
  const current = businessWallParts(now, timeZone);
  const currentWall = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute);
  const firstDay = Date.UTC(current.year, current.month - 1, current.day);
  const booked = new Set(appointments.filter((item) => item.status === "scheduled").map((item) => pickupSlotId(item.slotDate, item.slotTime)));
  const result: PickupSlot[] = [];
  for (let offset = 0; offset <= settings.bookingWindowDays; offset++) {
    const day = new Date(firstDay + offset * 86_400_000);
    if (!settings.weekdays.includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    for (let minute = minutes(settings.startTime); minute + settings.slotMinutes <= minutes(settings.endTime); minute += settings.slotMinutes) {
      const hour = Math.floor(minute / 60);
      const min = minute % 60;
      const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const slotWall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, min);
      if (slotWall < currentWall + settings.minimumLeadHours * 3_600_000) continue;
      const id = pickupSlotId(date, time);
      if (booked.has(id)) continue;
      result.push({
        id,
        date,
        time,
        label: `${new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"}).format(day)} · ${timeLabel(time)}`,
      });
    }
  }
  return result;
}

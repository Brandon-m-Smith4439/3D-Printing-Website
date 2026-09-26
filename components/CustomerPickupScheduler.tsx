"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PickupAppointment, PickupSlot } from "@/lib/pickup-types";

type PickupPayload = {
  eligible: boolean;
  reason: string;
  publicLocation: { locationName: string; publicArea: string };
  timeZone: string;
  slots: PickupSlot[];
  appointment: PickupAppointment | null;
  finalBalancePaid: boolean;
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}
function formatTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}
function fullAddress(appointment: PickupAppointment) {
  return [
    appointment.location.street1,
    appointment.location.street2,
    [appointment.location.city, appointment.location.state, appointment.location.zip].filter(Boolean).join(", "),
  ].filter(Boolean);
}

export function CustomerPickupScheduler({
  requestId,
  emailVerified,
  onChanged,
  onMessage,
}: {
  requestId: string;
  emailVerified: boolean;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [data, setData] = useState<PickupPayload | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/account/requests/${requestId}/pickup`, { cache: "no-store" });
    const result = await response.json() as PickupPayload & { message?: string };
    if (!response.ok) throw new Error(result.message || "Could not load pickup availability.");
    setData(result);
    if (!result.appointment) setChanging(false);
  }, [requestId]);

  useEffect(() => {
    void load().catch((error) => onMessage(error instanceof Error ? error.message : "Could not load pickup availability."));
  }, [load, onMessage]);

  const grouped = useMemo(() => {
    const map = new Map<string, PickupSlot[]>();
    for (const slot of data?.slots || []) {
      const current = map.get(slot.date) || [];
      current.push(slot);
      map.set(slot.date, current);
    }
    return [...map.entries()];
  }, [data?.slots]);

  async function schedule() {
    if (!selected) {
      onMessage("Choose a pickup time first.");
      return;
    }
    setBusy(true);
    onMessage("");
    try {
      const response = await fetch(`/api/account/requests/${requestId}/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selected }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not schedule pickup.");
      onMessage(result.message || "Pickup scheduled.");
      setSelected("");
      setChanging(false);
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not schedule pickup.");
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this pickup appointment? You can choose another available time while the order is still Ready.")) return;
    setBusy(true);
    onMessage("");
    try {
      const response = await fetch(`/api/account/requests/${requestId}/pickup`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not cancel pickup.");
      onMessage(result.message || "Pickup cancelled.");
      setSelected("");
      await Promise.all([load(), onChanged()]);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not cancel pickup.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="customer-pickup-scheduler is-loading"><strong>Local pickup</strong><span>Loading available pickup times…</span></section>;

  const appointment = data.appointment;
  const showSlots = !appointment || changing;

  return <section className="customer-pickup-scheduler">
    <div className="customer-pickup-heading">
      <div><span className="eyebrow">LOCAL PICKUP</span><h4>{appointment ? "Pickup scheduled" : "Schedule your pickup"}</h4></div>
      <span className={data.finalBalancePaid ? "pickup-payment-badge is-paid" : "pickup-payment-badge"}>{data.finalBalancePaid ? "Balance paid" : "Balance due before handoff"}</span>
    </div>

    {appointment && !changing && <div className="pickup-confirmed-card">
      <div className="pickup-confirmed-time"><span>Confirmed pickup</span><strong>{formatDate(appointment.slotDate)}</strong><b>{formatTime(appointment.slotTime)}</b><small>{appointment.timeZone.replaceAll("_", " ")}</small></div>
      <div className="pickup-confirmed-location">
        <span>Pickup location</span>
        <strong>{appointment.location.locationName}</strong>
        {fullAddress(appointment).map((line) => <b key={line}>{line}</b>)}
        {appointment.location.instructions && <p>{appointment.location.instructions}</p>}
      </div>
      <div className="pickup-confirmed-actions">
        <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => setChanging(true)}>Change time</button>
        <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void cancel()}>Cancel pickup</button>
      </div>
    </div>}

    {showSlots && <>
      <div className="pickup-public-location">
        <div><strong>{data.publicLocation.locationName}</strong><span>{data.publicLocation.publicArea}</span></div>
        <small>The exact address and arrival instructions are revealed after you reserve a time.</small>
      </div>
      {!emailVerified && <div className="quote-verification-needed"><strong>Email verification required</strong><span>Verify your email before reserving a pickup appointment.</span></div>}
      {!data.eligible ? <div className="pickup-unavailable"><strong>Scheduling not available yet</strong><span>{data.reason || "Pickup scheduling is currently unavailable."}</span></div> :
        grouped.length === 0 ? <div className="pickup-unavailable"><strong>No open pickup slots</strong><span>There are no available appointments in the current booking window. Check back later or contact Mesh Harbor 3D.</span></div> :
        <div className="pickup-slot-groups">
          {grouped.map(([date, slots]) => <div className="pickup-slot-day" key={date}>
            <strong>{formatDate(date)}</strong>
            <div className="pickup-slot-grid">{slots.map((slot) => <button key={slot.id} type="button" disabled={busy || !emailVerified} className={selected === slot.id ? "is-selected" : ""} onClick={() => setSelected(slot.id)}>{formatTime(slot.time)}</button>)}</div>
          </div>)}
        </div>
      }
      {data.eligible && grouped.length > 0 && <div className="pickup-schedule-actions">
        <button className="button button-small" type="button" disabled={busy || !emailVerified || !selected} onClick={() => void schedule()}>{busy ? "Saving…" : appointment ? "Confirm New Pickup Time" : "Reserve Pickup Time"}</button>
        {appointment && <button className="button button-cancel button-small" type="button" disabled={busy} onClick={() => { setChanging(false); setSelected(""); }}>Keep Current Time</button>}
      </div>}
      <small className="pickup-private-note">Pickup appointments are private and tied to your customer account. The exact pickup address is not shown on the public Queue.</small>
    </>}
  </section>;
}

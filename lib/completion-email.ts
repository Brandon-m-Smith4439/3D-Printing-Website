import "server-only";
import type { QueueJob } from "@/lib/queue-types";
import { getSiteContent } from "@/lib/site-content-store";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendCompletionEmail(job: QueueJob) {
  const site = await getSiteContent();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REQUEST_FROM_EMAIL;

  const configured = Boolean(
    apiKey && !apiKey.startsWith("YOUR_") &&
    from && !from.includes("yourdomain.com")
  );

  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Completion email delivery is not configured.");
    }
    console.info(`Completion email (development) -> ${job.customerEmail}: ${job.publicCode} ${job.publicTitle}`);
    return { sent: false, developmentOnly: true };
  }

  const handoff =
    job.fulfillmentMethod === "pickup"
      ? "I’ll follow up with pickup details if we have not already arranged them."
      : job.fulfillmentMethod === "shipping"
        ? "I’ll follow up with shipping details or tracking as applicable."
        : job.fulfillmentMethod === "local-delivery"
          ? "I’ll follow up to coordinate your local delivery handoff."
          : "I’ll follow up with the final pickup or shipping details.";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6">
      <p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#4b78a8">${escapeHtml(site.name.toUpperCase())}</p>
      <h1 style="font-size:26px;margin-bottom:12px">Your 3D print is finished.</h1>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your print <strong>${escapeHtml(job.publicTitle)}</strong> (${escapeHtml(job.publicCode)}) has been completed.</p>
      <p>${escapeHtml(handoff)}</p>
      <p style="margin-top:28px">Thank you,<br>${escapeHtml(site.name)}</p>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [job.customerEmail],
      subject: `Your 3D print is finished — ${job.publicCode}`,
      html,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Email provider rejected the completion email.");
  return { sent: true, developmentOnly: false };
}

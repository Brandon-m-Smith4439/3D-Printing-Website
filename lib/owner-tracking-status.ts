export const ownerTrackingStatuses = [
  "new",
  "reviewing",
  "quoted",
  "accepted",
  "deposit-paid",
  "queued",
  "preparing",
  "printing",
  "finishing",
  "ready",
  "on-hold",
  "completed",
  "declined",
] as const;

export type OwnerTrackingStatus = (typeof ownerTrackingStatuses)[number];

export const ownerTrackingStatusLabels: Record<OwnerTrackingStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  quoted: "Quote sent",
  accepted: "Quote approved",
  "deposit-paid": "Deposit paid",
  queued: "Queued",
  preparing: "Preparing / slicing",
  printing: "Printing now",
  finishing: "Finishing / cleanup",
  ready: "Ready",
  "on-hold": "On hold",
  completed: "Completed",
  declined: "Declined",
};

export const ownerTrackingStatusMessages: Record<OwnerTrackingStatus, string> = {
  new: "Your custom request is marked as new and is waiting for review.",
  reviewing: "Your custom request is being reviewed and planned.",
  quoted: "Your custom request is at the quote-sent stage.",
  accepted: "Your custom request is at the quote-approved stage.",
  "deposit-paid": "Your custom request is at the deposit-paid stage.",
  queued: "Your custom request is queued for production.",
  preparing: "Your custom request is being prepared and sliced for production.",
  printing: "Your custom request is currently printing.",
  finishing: "Your custom request is in finishing and cleanup.",
  ready: "Your custom request is ready.",
  "on-hold": "Your custom request is currently on hold.",
  completed: "Your custom request is complete.",
  declined: "Your custom request has been declined / closed.",
};

export function ownerTrackingStep(status: OwnerTrackingStatus) {
  if (status === "completed") return 5;
  if (["queued", "preparing", "printing", "finishing", "ready", "on-hold"].includes(status)) return 4;
  if (status === "deposit-paid") return 3;
  if (["quoted", "accepted"].includes(status)) return 2;
  return 1;
}

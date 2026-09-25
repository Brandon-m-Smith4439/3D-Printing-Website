export type FollowUpType = "quote" | "deposit" | "final-invoice" | "waiting-on-customer";
export type FollowUpStatus = "pending" | "sending" | "sent" | "deferred" | "failed" | "canceled";

export type CustomerFollowUpRecord = {
  id: string;
  requestId: string;
  requestCode: string;
  customerAccountId: string;
  type: FollowUpType;
  stage: 1 | 2;
  anchorId: string;
  anchorRevision: number;
  dueAt: string;
  status: FollowUpStatus;
  subject: string;
  text: string;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptAt: string;
  nextAttemptAt: string;
  sentAt: string;
  resendEmailId: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFollowUpSettings = {
  enabled: boolean;
  updatedAt: string;
  updatedBy: "owner" | "system";
};

export type RequestFollowUpControl = {
  id: string;
  requestId: string;
  paused: boolean;
  waitingOnCustomer: boolean;
  waitingSince: string;
  waitingNote: string;
  updatedAt: string;
};

export type FollowUpCandidate = {
  id: string;
  requestId: string;
  requestCode: string;
  customerAccountId: string;
  type: FollowUpType;
  stage: 1 | 2;
  anchorId: string;
  anchorRevision: number;
  dueAt: string;
  eligible: boolean;
  blockedReason: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

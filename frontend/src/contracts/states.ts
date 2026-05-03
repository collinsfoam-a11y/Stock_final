export const SESSION_STATES = ["CREATED", "ACTIVE", "REVIEW", "FINALIZED"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const COUNT_LINE_STATES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "LOCKED",
] as const;
export type CountLineState = (typeof COUNT_LINE_STATES)[number];

const SESSION_ALIASES: Record<string, SessionState> = {
  OPEN: "CREATED",
  CREATED: "CREATED",
  ACTIVE: "ACTIVE",
  PAUSED: "ACTIVE",
  REVIEW: "REVIEW",
  RECONCILE: "REVIEW",
  RECONCILING: "REVIEW",
  COMPLETED: "FINALIZED",
  CLOSED: "FINALIZED",
  FINALIZED: "FINALIZED",
  CANCELLED: "FINALIZED",
};

export function normalizeSessionState(value: unknown): SessionState | "UNKNOWN" {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "UNKNOWN";
  return SESSION_ALIASES[raw] || "UNKNOWN";
}

const COUNT_LINE_ALIASES: Record<string, CountLineState> = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  PENDING: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  LOCKED: "LOCKED",
  FINALIZED: "LOCKED",
};

export function normalizeCountLineState(value: unknown): CountLineState | "UNKNOWN" {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "UNKNOWN";
  return COUNT_LINE_ALIASES[raw] || "UNKNOWN";
}

import type { MovementType } from "@/lib/db/schema";

type Tone = "default" | "danger" | "warn" | "ok" | "primary";

export const INVOICE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "default" },
  sent: { label: "Sent", tone: "primary" },
  partial: { label: "Partially paid", tone: "warn" },
  paid: { label: "Paid", tone: "ok" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "default" },
};

export const QUOTE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "default" },
  sent: { label: "Sent", tone: "primary" },
  accepted: { label: "Accepted", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "warn" },
  converted: { label: "Converted", tone: "ok" },
};

export const MOVEMENT_META: Record<
  MovementType,
  { label: string; tone: "ok" | "danger" | "warn" | "primary"; sign: string }
> = {
  restock: { label: "Restock", tone: "ok", sign: "+" },
  usage: { label: "Usage", tone: "danger", sign: "−" },
  waste: { label: "Waste", tone: "warn", sign: "−" },
  adjustment: { label: "Adjustment", tone: "primary", sign: "±" },
};

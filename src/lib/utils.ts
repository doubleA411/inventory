import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a numeric string/number for display, trimming trailing zeros. */
export function fmtQty(n: number | string): string {
  const num = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

export function fmtMoney(n: number | string, currency = "INR"): string {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isNaN(num) ? 0 : num);
}

/** YYYY-MM-DD for a specific business timezone, independent of server UTC. */
export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** YYYY-MM-DD in the browser/device timezone for native date inputs. */
export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  // JS parses a bare YYYY-MM-DD string as UTC. In timezones west of UTC that
  // renders as the previous calendar day, even though date-only database
  // fields have no timezone. Construct it as a local calendar date instead.
  const dateOnly = typeof d === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : typeof d === "string"
      ? new Date(d)
      : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

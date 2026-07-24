import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-(--color-muted)">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warn" | "ok";
  href?: string;
}) {
  const toneClass = {
    default: "",
    danger: "text-(--color-danger)",
    warn: "text-(--color-warn)",
    ok: "text-(--color-ok)",
  }[tone];

  const inner = (
    <div className="card p-4 transition-shadow hover:shadow-md">
      <div className="text-sm text-(--color-muted)">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-(--color-muted)">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger" | "warn" | "ok" | "primary";
}) {
  const map = {
    default: "bg-(--color-bg) text-(--color-muted)",
    danger: "bg-(--color-danger-soft) text-(--color-danger)",
    warn: "bg-(--color-warn-soft) text-(--color-warn)",
    ok: "bg-(--color-ok-soft) text-(--color-ok)",
    primary: "bg-(--color-primary-soft) text-(--color-primary)",
  }[tone];
  return <span className={cn("badge", map)}>{children}</span>;
}

export function DateFilter({
  basePath,
  from,
  to,
}: {
  basePath: string;
  from?: string;
  to?: string;
}) {
  const has = !!(from || to);
  return (
    <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-(--color-muted)">From</label>
        <input type="date" name="from" defaultValue={from ?? ""} className="input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-(--color-muted)">To</label>
        <input type="date" name="to" defaultValue={to ?? ""} className="input" />
      </div>
      <button type="submit" className="btn-primary">
        Apply
      </button>
      {has && (
        <Link href={basePath} className="btn-ghost">
          Clear
        </Link>
      )}
    </form>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
      <div className="text-base font-medium">{title}</div>
      {description && (
        <div className="max-w-sm text-sm text-(--color-muted)">{description}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

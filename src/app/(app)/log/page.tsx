import Link from "next/link";
import { AuditPasswordForm } from "./audit-password-form";
import { requireRole } from "@/lib/auth";
import { hasAuditAccess } from "@/lib/auth/session";
import { auditFilterOptions, listAuditEvents } from "@/lib/audit";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import type { AuditEvent } from "@/lib/db/schema";

type SearchParams = {
  q?: string;
  action?: string;
  entity?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: string;
};

// Records that have a page of their own, so an event can link straight to it.
const ENTITY_ROUTES: Record<string, string> = {
  invoice: "/invoices",
  quotation: "/quotations",
  customer: "/customers",
  vendor: "/vendors",
  product: "/products",
  purchase_bill: "/purchase-bills",
  purchase_list: "/purchase-lists",
};

function label(value: string) {
  return value.replace(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionTone(action: string): "default" | "danger" | "warn" | "ok" | "primary" {
  if (/(archived|deleted|reversed|removed|revoked|cancelled|login_failed)$/.test(action)) return "danger";
  if (/(approved|restored|created|recorded)$/.test(action)) return "ok";
  if (action.startsWith("settings.") || action.startsWith("team.") || action.startsWith("auth.password")) {
    return "warn";
  }
  return "default";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization, user } = await requireRole("owner");
  if (!(await hasAuditAccess(user.id, user.passwordHash))) return <AuditPasswordForm />;

  const sp = await searchParams;
  const filters = {
    q: sp.q,
    action: sp.action,
    entityType: sp.entity,
    actorId: sp.actor,
    from: sp.from,
    to: sp.to,
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const timeZone = organization.timezone;
  const [{ events, hasMore }, options] = await Promise.all([
    listAuditEvents(organization.id, timeZone, filters, page),
    auditFilterOptions(organization.id),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);

  const when = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit" });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/log?${qs}` : "/log";
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="A permanent record of every material action taken in this organization. Entries can't be edited or deleted."
      />
      <form method="get" className="card mb-5 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="audit-search" className="mb-1 block text-xs font-medium text-(--color-muted)">Search</label>
          <input id="audit-search" name="q" type="search" defaultValue={sp.q ?? ""} className="input w-full" placeholder="Invoice number, person, amount…" />
        </div>
        <FilterSelect label="Action" name="action" value={sp.action} options={options.actions.map((v) => ({ value: v.value, label: label(v.value) }))} />
        <FilterSelect label="Record" name="entity" value={sp.entity} options={options.entityTypes.map((v) => ({ value: v.value, label: label(v.value) }))} />
        <FilterSelect label="Performed by" name="actor" value={sp.actor} options={options.actors.map((v) => ({ value: v.id!, label: v.name ?? "Removed user" }))} />
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs font-medium text-(--color-muted)">From</label>
          <input id="audit-from" name="from" type="date" defaultValue={sp.from ?? ""} className="input w-full" />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs font-medium text-(--color-muted)">To</label>
          <input id="audit-to" name="to" type="date" defaultValue={sp.to ?? ""} className="input w-full" />
        </div>
        <div className="flex items-end gap-2 lg:col-span-2">
          <button type="submit" className="btn-primary">Apply</button>
          {hasFilters && <Link href="/log" className="btn-ghost">Clear</Link>}
        </div>
      </form>

      {events.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description={hasFilters ? "Try removing a filter or using a broader search." : "New actions will appear here as your team works."}
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="record-table-wrap overflow-x-auto">
              <table className="record-table w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Record</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                    <th className="px-4 py-3 font-medium">Performed by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {events.map((event) => (
                    <tr key={event.id} className="align-top hover:bg-(--color-bg)">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-(--color-muted)">
                        {when.format(event.createdAt)}
                        <div>{time.format(event.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={actionTone(event.action)}>{label(event.action)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <RecordCell event={event} />
                      </td>
                      <td className="max-w-md px-4 py-3 text-(--color-muted)">
                        {event.summary}
                        <DetailsDisclosure details={event.details} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {event.actorName ?? (event.actorUserId ? "Removed user" : "System")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {(page > 1 || hasMore) && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Audit log pages">
              {page > 1 ? <Link href={pageHref(page - 1)} className="btn-ghost">Newer</Link> : <span />}
              <span className="text-(--color-muted)">Page {page}</span>
              {hasMore ? <Link href={pageHref(page + 1)} className="btn-ghost">Older</Link> : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function RecordCell({ event }: { event: AuditEvent }) {
  const name = event.entityLabel ?? label(event.entityType);
  const base = ENTITY_ROUTES[event.entityType];
  return (
    <>
      <div className="font-medium">
        {base && event.entityId ? (
          <Link href={`${base}/${event.entityId}`} className="hover:underline">{name}</Link>
        ) : (
          name
        )}
      </div>
      <div className="text-xs text-(--color-muted)">{label(event.entityType)}</div>
    </>
  );
}

function DetailsDisclosure({ details }: { details: Record<string, unknown> | null }) {
  const entries = Object.entries(details ?? {}).filter(([, v]) => v != null && v !== "");
  if (!entries.length) return null;
  const show = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer select-none">More</summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {entries.map(([key, value]) => {
          const change =
            value && typeof value === "object" && "from" in value && "to" in value
              ? (value as { from: unknown; to: unknown })
              : null;
          return (
            <div key={key} className="contents">
              <dt className="font-medium">{label(key)}</dt>
              <dd className="break-all">
                {change ? `${show(change.from ?? "—")} → ${show(change.to ?? "—")}` : show(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

function FilterSelect({ label: labelText, name, value, options }: { label: string; name: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={`audit-${name}`} className="mb-1 block text-xs font-medium text-(--color-muted)">{labelText}</label>
      <select id={`audit-${name}`} name={name} defaultValue={value ?? ""} className="input w-full">
        <option value="">All</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

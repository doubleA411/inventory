"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, ListPlus, Plus, Trash2, UserPlus } from "lucide-react";
import { computeTotals } from "@/lib/tax";
import { fmtMoney } from "@/lib/utils";
import { saveCustomer } from "@/app/(app)/customers/actions";
import { TAMIL_NADU_CODE } from "@/lib/india-states";

type CustomerLite = { id: string; name: string; stateCode: string | null };
type ItemRow = {
  key: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  taxRate: string;
  menuItems: string[];
  eventDate: string;
};

export type DocEditorInitial = {
  id?: string;
  customerId?: string | null;
  issueDate?: string;
  secondDate?: string | null; // validUntil (quote) or dueDate (invoice)
  venue?: string | null;
  notes?: string | null;
  terms?: string | null;
  applyGst?: boolean; // invoice only
  items?: {
    description: string;
    hsnSac?: string | null;
    quantity: number | string;
    unit?: string | null;
    rate: number | string;
    taxRate: number | string;
    menuItems?: string[] | null;
    eventDate?: string | null;
  }[];
};

// Server action passed from the page; input shape differs per kind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SaveFn = (input: any) => Promise<{ ok: boolean; id?: string; error?: string }>;

let keySeq = 0;
const newRow = (over: Partial<ItemRow> = {}): ItemRow => ({
  key: `r${keySeq++}`,
  description: "",
  hsnSac: "",
  quantity: "1",
  unit: "",
  rate: "",
  taxRate: "",
  menuItems: [],
  eventDate: "",
  ...over,
});

const today = () => new Date().toISOString().slice(0, 10);

export function DocEditor({
  kind,
  customers,
  orgStateCode,
  gstEnabled,
  defaultTaxRate,
  defaultSac,
  defaultTerms,
  currency,
  initial,
  save,
}: {
  kind: "quote" | "invoice";
  customers: CustomerLite[];
  orgStateCode: string | null;
  gstEnabled: boolean;
  defaultTaxRate: string;
  defaultSac: string | null;
  defaultTerms: string | null;
  currency: string;
  initial?: DocEditorInitial;
  save: SaveFn;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today());
  const [secondDate, setSecondDate] = useState(initial?.secondDate ?? "");
  const [venue, setVenue] = useState(initial?.venue ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? defaultTerms ?? "");
  const [rows, setRows] = useState<ItemRow[]>(
    initial?.items?.length
      ? initial.items.map((i) =>
          newRow({
            description: i.description,
            hsnSac: i.hsnSac ?? "",
            quantity: String(i.quantity),
            unit: i.unit ?? "",
            rate: String(i.rate),
            taxRate: String(i.taxRate),
            menuItems: i.menuItems ?? [],
            eventDate: i.eventDate ?? "",
          }),
        )
      : [newRow({ taxRate: gstEnabled ? defaultTaxRate : "0", hsnSac: defaultSac ?? "" })],
  );
  const [applyGst, setApplyGst] = useState(initial?.applyGst ?? true);
  const effectiveGst = kind === "invoice" ? gstEnabled && applyGst : gstEnabled;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  function toggleMenuItems(key: string) {
    setExpandedRows((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Inline new-customer form.
  const [showNewCust, setShowNewCust] = useState(false);
  const [nc, setNc] = useState({ name: "", gstin: "", district: "Chennai", location: "", phone: "" });
  const [custList, setCustList] = useState(customers);

  const selectedCust = custList.find((c) => c.id === customerId);
  const intraState = selectedCust?.stateCode
    ? selectedCust.stateCode === orgStateCode
    : true;

  const totals = useMemo(
    () =>
      computeTotals(
        rows.map((r) => ({
          quantity: Number(r.quantity) || 0,
          rate: Number(r.rate) || 0,
          taxRate: Number(r.taxRate) || 0,
        })),
        { gstEnabled: effectiveGst, intraState },
      ),
    [rows, effectiveGst, intraState],
  );

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      newRow({ taxRate: gstEnabled ? defaultTaxRate : "0", hsnSac: defaultSac ?? "" }),
    ]);
  }
  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  async function addCustomer() {
    if (!nc.name.trim()) return;
    const res = await saveCustomer({
      name: nc.name,
      gstin: nc.gstin || null,
      district: nc.district || "Chennai",
      location: nc.location || null,
      phone: nc.phone || null,
    });
    if (res.ok && res.id) {
      const added = { id: res.id, name: nc.name, stateCode: TAMIL_NADU_CODE };
      setCustList((l) => [...l, added].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(res.id);
      setShowNewCust(false);
      setNc({ name: "", gstin: "", district: "Chennai", location: "", phone: "" });
    } else {
      setError(res.error ?? "Could not add customer");
    }
  }

  function onSave() {
    setError(null);
    const payload =
      kind === "invoice"
        ? {
            id: initial?.id,
            customerId: customerId || null,
            issueDate,
            dueDate: secondDate || null,
            venue: venue || null,
            notes,
            terms,
            applyGst: gstEnabled ? applyGst : undefined,
            items: rows.map((r) => ({
              description: r.description,
              hsnSac: r.hsnSac || null,
              quantity: Number(r.quantity) || 0,
              unit: r.unit || null,
              rate: Number(r.rate) || 0,
              taxRate: Number(r.taxRate) || 0,
              menuItems: r.menuItems,
              eventDate: r.eventDate || null,
            })),
          }
        : {
            id: initial?.id,
            customerId: customerId || null,
            issueDate,
            validUntil: secondDate || null,
            venue: venue || null,
            notes,
            terms,
            items: rows.map((r) => ({
              description: r.description,
              hsnSac: r.hsnSac || null,
              quantity: Number(r.quantity) || 0,
              unit: r.unit || null,
              rate: Number(r.rate) || 0,
              taxRate: Number(r.taxRate) || 0,
              menuItems: r.menuItems,
              eventDate: r.eventDate || null,
            })),
          };

    startTransition(async () => {
      const res = await save(payload);
      if (res.ok && res.id) {
        router.push(`/${kind === "invoice" ? "invoices" : "quotations"}/${res.id}`);
      } else {
        setError(res.error ?? "Could not save");
      }
    });
  }

  const base = kind === "invoice" ? "/invoices" : "/quotations";

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label">Customer</label>
            <div className="flex gap-2">
              <select
                className="input"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Select / walk-in —</option>
                {custList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-outline shrink-0"
                onClick={() => setShowNewCust((v) => !v)}
                title="New customer"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">
              {kind === "invoice" ? "Due date" : "Valid until"}
            </label>
            <input
              type="date"
              className="input"
              value={secondDate}
              onChange={(e) => setSecondDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Venue</label>
            <input
              className="input"
              placeholder="Mandapam / event venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </div>
        </div>

        {showNewCust && (
          <div className="mt-4 grid gap-3 rounded-lg border border-(--color-border) bg-(--color-bg) p-3 sm:grid-cols-4">
            <input
              className="input sm:col-span-2"
              placeholder="Customer name"
              value={nc.name}
              onChange={(e) => setNc({ ...nc, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="GSTIN (optional)"
              value={nc.gstin}
              onChange={(e) => setNc({ ...nc, gstin: e.target.value })}
            />
            <input
              className="input"
              placeholder="District"
              value={nc.district}
              onChange={(e) => setNc({ ...nc, district: e.target.value })}
            />
            <input
              className="input"
              placeholder="Location (area)"
              value={nc.location}
              onChange={(e) => setNc({ ...nc, location: e.target.value })}
            />
            <input
              className="input sm:col-span-2"
              placeholder="Phone (optional)"
              value={nc.phone}
              onChange={(e) => setNc({ ...nc, phone: e.target.value })}
            />
            <div className="flex gap-2 sm:col-span-2">
              <button type="button" className="btn-primary" onClick={addCustomer}>
                Add customer
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowNewCust(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase text-(--color-muted)">
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">HSN/SAC</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Rate</th>
                {gstEnabled && <th className="px-3 py-2 font-medium">Tax %</th>}
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {rows.map((r, idx) => (
                <Fragment key={r.key}>
                <tr>
                  <td className="px-2 py-1.5 min-w-[220px]">
                    <input
                      className="input"
                      placeholder="Item / service"
                      value={r.description}
                      onChange={(e) => updateRow(r.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input w-24"
                      value={r.hsnSac}
                      onChange={(e) => updateRow(r.key, { hsnSac: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input w-20"
                      type="number"
                      step="any"
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input w-20"
                      value={r.unit}
                      onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input w-28"
                      type="number"
                      step="any"
                      value={r.rate}
                      onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                    />
                  </td>
                  {gstEnabled && (
                    <td className="px-2 py-1.5">
                      <input
                        className="input w-20"
                        type="number"
                        step="any"
                        value={r.taxRate}
                        onChange={(e) => updateRow(r.key, { taxRate: e.target.value })}
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtMoney(totals.lines[idx]?.amount ?? 0, currency)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Menu items"
                        onClick={() => toggleMenuItems(r.key)}
                      >
                        {expandedRows.has(r.key) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <ListPlus className="h-4 w-4" />
                        {r.menuItems.length > 0 && (
                          <span className="text-xs text-(--color-muted)">
                            {r.menuItems.length}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => removeRow(r.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedRows.has(r.key) && (
                  <tr>
                    <td colSpan={gstEnabled ? 8 : 7} className="bg-(--color-bg) px-4 py-3">
                      <MenuItemsEditor
                        eventDate={r.eventDate}
                        onEventDateChange={(eventDate) => updateRow(r.key, { eventDate })}
                        items={r.menuItems}
                        onAdd={(text) =>
                          updateRow(r.key, { menuItems: [...r.menuItems, text] })
                        }
                        onRemove={(i) =>
                          updateRow(r.key, {
                            menuItems: r.menuItems.filter((_, mi) => mi !== i),
                          })
                        }
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-(--color-border) p-3">
          <button type="button" className="btn-outline" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>
      </div>

      {/* Totals + notes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Terms &amp; conditions</label>
            <textarea
              className="input"
              rows={2}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
        </div>
        <div className="card h-fit p-4">
          {kind === "invoice" && gstEnabled && (
            <label className="mb-3 flex items-start gap-2 border-b border-(--color-border) pb-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={applyGst}
                onChange={(e) => setApplyGst(e.target.checked)}
              />
              <span>
                Apply GST to this invoice
                <span className="block text-xs text-(--color-muted)">
                  Off issues a Bill of Supply instead of a Tax Invoice.
                </span>
              </span>
            </label>
          )}
          <Row label="Subtotal" value={fmtMoney(totals.subtotal, currency)} />
          {effectiveGst && intraState && (
            <>
              <Row label={`CGST`} value={fmtMoney(totals.cgst, currency)} muted />
              <Row label={`SGST`} value={fmtMoney(totals.sgst, currency)} muted />
            </>
          )}
          {effectiveGst && !intraState && (
            <Row label="IGST" value={fmtMoney(totals.igst, currency)} muted />
          )}
          {kind === "invoice" && (
            <Row label="Round off" value={fmtMoney(totals.roundOff, currency)} muted />
          )}
          <div className="mt-2 border-t border-(--color-border) pt-2">
            <Row label="Total" value={fmtMoney(totals.total, currency)} bold />
          </div>
          {!effectiveGst && (
            <p className="mt-2 text-xs text-(--color-muted)">
              {gstEnabled
                ? "GST off for this invoice — this will be a Bill of Supply."
                : "Not GST-registered — this is a Bill of Supply (no tax)."}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : `Create ${kind === "invoice" ? "invoice" : "quotation"}`}
        </button>
        <Link href={base} className="btn-ghost">
          Cancel
        </Link>
      </div>
    </div>
  );
}

function MenuItemsEditor({
  eventDate,
  onEventDateChange,
  items,
  onAdd,
  onRemove,
}: {
  eventDate: string;
  onEventDateChange: (value: string) => void;
  items: string[];
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
}) {
  const [draft, setDraft] = useState("");
  function submit() {
    if (draft.trim()) {
      onAdd(draft.trim());
      setDraft("");
    }
  }
  return (
    <div>
      <label className="label mb-2 block">Event date</label>
      <input
        type="date"
        className="input mb-3 w-52"
        value={eventDate}
        onChange={(e) => onEventDateChange(e.target.value)}
      />
      <p className="label mb-2">Menu items (printed as a numbered list on the menu page)</p>
      {items.length > 0 && (
        <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm">
          {items.map((m, i) => (
            <li key={i}>
              <div className="flex items-center justify-between gap-2">
                <span>{m}</span>
                <button
                  type="button"
                  className="btn-ghost px-1 py-0.5"
                  onClick={() => onRemove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Add a menu item"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn-outline shrink-0" onClick={submit}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className={muted ? "text-(--color-muted)" : ""}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-base font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}

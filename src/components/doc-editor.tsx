"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { computeTotals } from "@/lib/tax";
import { fmtMoney } from "@/lib/utils";
import { INDIA_STATES } from "@/lib/india-states";
import { saveCustomer } from "@/app/(app)/customers/actions";

type CustomerLite = { id: string; name: string; stateCode: string | null };
type ItemRow = {
  key: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  taxRate: string;
};

export type DocEditorInitial = {
  id?: string;
  customerId?: string | null;
  issueDate?: string;
  secondDate?: string | null; // validUntil (quote) or dueDate (invoice)
  notes?: string | null;
  terms?: string | null;
  items?: {
    description: string;
    hsnSac?: string | null;
    quantity: number | string;
    unit?: string | null;
    rate: number | string;
    taxRate: number | string;
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
          }),
        )
      : [newRow({ taxRate: gstEnabled ? defaultTaxRate : "0", hsnSac: defaultSac ?? "" })],
  );

  // Inline new-customer form.
  const [showNewCust, setShowNewCust] = useState(false);
  const [nc, setNc] = useState({ name: "", gstin: "", stateCode: "", phone: "" });
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
        { gstEnabled, intraState },
      ),
    [rows, gstEnabled, intraState],
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
      stateCode: nc.stateCode || null,
      phone: nc.phone || null,
    });
    if (res.ok && res.id) {
      const added = { id: res.id, name: nc.name, stateCode: nc.stateCode || null };
      setCustList((l) => [...l, added].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(res.id);
      setShowNewCust(false);
      setNc({ name: "", gstin: "", stateCode: "", phone: "" });
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
            notes,
            terms,
            items: rows.map((r) => ({
              description: r.description,
              hsnSac: r.hsnSac || null,
              quantity: Number(r.quantity) || 0,
              unit: r.unit || null,
              rate: Number(r.rate) || 0,
              taxRate: Number(r.taxRate) || 0,
            })),
          }
        : {
            id: initial?.id,
            customerId: customerId || null,
            issueDate,
            validUntil: secondDate || null,
            notes,
            terms,
            items: rows.map((r) => ({
              description: r.description,
              hsnSac: r.hsnSac || null,
              quantity: Number(r.quantity) || 0,
              unit: r.unit || null,
              rate: Number(r.rate) || 0,
              taxRate: Number(r.taxRate) || 0,
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
            <select
              className="input"
              value={nc.stateCode}
              onChange={(e) => setNc({ ...nc, stateCode: e.target.value })}
            >
              <option value="">State (place of supply)</option>
              {INDIA_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
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
                <tr key={r.key}>
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
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeRow(r.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
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
          <Row label="Subtotal" value={fmtMoney(totals.subtotal, currency)} />
          {gstEnabled && intraState && (
            <>
              <Row label={`CGST`} value={fmtMoney(totals.cgst, currency)} muted />
              <Row label={`SGST`} value={fmtMoney(totals.sgst, currency)} muted />
            </>
          )}
          {gstEnabled && !intraState && (
            <Row label="IGST" value={fmtMoney(totals.igst, currency)} muted />
          )}
          {kind === "invoice" && (
            <Row label="Round off" value={fmtMoney(totals.roundOff, currency)} muted />
          )}
          <div className="mt-2 border-t border-(--color-border) pt-2">
            <Row label="Total" value={fmtMoney(totals.total, currency)} bold />
          </div>
          {!gstEnabled && (
            <p className="mt-2 text-xs text-(--color-muted)">
              Not GST-registered — this is a Bill of Supply (no tax).
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

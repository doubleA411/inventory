"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ListPlus,
  Pencil,
  Plus,
  GripVertical,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { computeTotals } from "@/lib/tax";
import { fmtMoney, cn } from "@/lib/utils";
import { saveCustomer } from "@/app/(app)/customers/actions";
import { TAMIL_NADU_CODE } from "@/lib/india-states";
import { Sheet } from "@/components/sheet";

type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  stateCode: string | null;
  gstin?: string | null;
  district?: string | null;
  location?: string | null;
  email?: string | null;
};
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
  showMenuList?: boolean; // invoice only
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
  const [showMenuList, setShowMenuList] = useState(initial?.showMenuList ?? true);
  const effectiveGst = kind === "invoice" ? gstEnabled && applyGst : gstEnabled;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // The line-items table scrolls horizontally on narrow screens; the expanded
  // menu-items editor is a full editing surface, not another data column, so
  // it's pinned to the visible (scrolled) width instead of scrolling away
  // with the rest of the row — otherwise its numbers and action buttons end
  // up off-screen past whatever horizontal scroll position the table is at.
  const itemsScrollRef = useRef<HTMLDivElement>(null);
  const [itemsScrollWidth, setItemsScrollWidth] = useState<number>(0);
  useEffect(() => {
    const el = itemsScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setItemsScrollWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  function toggleMenuItems(key: string) {
    setExpandedRows((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Inline add/edit-customer form — same Sheet serves both; ncEditingId
  // tracks which mode (null = adding a new customer).
  const [showNewCust, setShowNewCust] = useState(false);
  const [ncEditingId, setNcEditingId] = useState<string | null>(null);
  const [nc, setNc] = useState({
    name: "",
    gstin: "",
    district: "Chennai",
    location: "",
    phone: "",
    email: "",
  });
  const [ncDuplicate, setNcDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [custList, setCustList] = useState(customers);

  const selectedCust = custList.find((c) => c.id === customerId);
  const intraState = selectedCust?.stateCode
    ? selectedCust.stateCode === orgStateCode
    : true;

  // Customer search — type-to-find by name or phone instead of scrolling a
  // long dropdown, which is what staff actually have to do with 100+ customers.
  const [custQuery, setCustQuery] = useState(selectedCust?.name ?? "");
  const [custOpen, setCustOpen] = useState(false);
  const custMatches = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    const list = q
      ? custList.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q),
        )
      : custList;
    return list.slice(0, 8);
  }, [custList, custQuery]);

  function selectCustomer(c: CustomerLite | null) {
    setCustomerId(c?.id ?? "");
    setCustQuery(c?.name ?? "");
    setCustOpen(false);
  }
  function closeCustDropdown() {
    // Let a click on a dropdown row register (via onMouseDown) before the
    // input's blur fires, then snap the visible text back to whatever is
    // actually selected — so a search that wasn't turned into a pick doesn't
    // silently leave stale text behind.
    setTimeout(() => {
      setCustOpen(false);
      setCustQuery(custList.find((c) => c.id === customerId)?.name ?? "");
    }, 120);
  }

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

  // Every row with a description is a real line the customer will be
  // charged for, so it must carry a quantity, unit, and rate — not just
  // the first row someone happened to fill in. Rows with no description at
  // all are still ignored (that's how a fresh blank row starts out) and get
  // dropped server-side too (billing.ts filters on description the same way).
  const hasValidItems = useMemo(() => {
    const withDescription = rows.filter((r) => r.description.trim());
    return (
      withDescription.length > 0 &&
      withDescription.every(
        (r) => Number(r.quantity) > 0 && r.unit.trim() && Number(r.rate) > 0,
      )
    );
  }, [rows]);

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

  async function addCustomer(confirmDuplicate = false) {
    if (!nc.name.trim() || !nc.phone.trim()) return;
    setNcDuplicate(null);
    const res = await saveCustomer({
      id: ncEditingId ?? undefined,
      name: nc.name,
      gstin: nc.gstin || null,
      district: nc.district || "Chennai",
      location: nc.location || null,
      phone: nc.phone,
      email: nc.email || null,
      confirmDuplicate,
    });
    if (res.ok && res.id) {
      const saved: CustomerLite = {
        id: res.id,
        name: nc.name,
        phone: nc.phone,
        stateCode: TAMIL_NADU_CODE,
        gstin: nc.gstin || null,
        district: nc.district || "Chennai",
        location: nc.location || null,
        email: nc.email || null,
      };
      setCustList((l) =>
        [...l.filter((c) => c.id !== saved.id), saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      selectCustomer(saved);
      setShowNewCust(false);
      setNc({ name: "", gstin: "", district: "Chennai", location: "", phone: "", email: "" });
    } else if (res.duplicate) {
      setNcDuplicate(res.duplicate);
    } else {
      setError(res.error ?? "Could not save customer");
    }
  }

  function openNewCustomer(prefillName = "") {
    setNcEditingId(null);
    setNc({ name: prefillName, gstin: "", district: "Chennai", location: "", phone: "", email: "" });
    setNcDuplicate(null);
    setShowNewCust(true);
    setCustOpen(false);
  }

  function openEditCustomer() {
    if (!selectedCust) return;
    setNcEditingId(selectedCust.id);
    setNc({
      name: selectedCust.name,
      gstin: selectedCust.gstin ?? "",
      district: selectedCust.district ?? "Chennai",
      location: selectedCust.location ?? "",
      phone: selectedCust.phone ?? "",
      email: selectedCust.email ?? "",
    });
    setNcDuplicate(null);
    setShowNewCust(true);
    setCustOpen(false);
  }

  function onSave() {
    setError(null);
    if (!hasValidItems) {
      setError(
        "Every line item needs a description, quantity, unit, and rate — check the highlighted rows.",
      );
      return;
    }
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
            showMenuList,
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
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
                <input
                  className="input pl-9"
                  placeholder="Search name or phone, or leave blank for walk-in"
                  value={custQuery}
                  onFocus={() => setCustOpen(true)}
                  onChange={(e) => {
                    setCustQuery(e.target.value);
                    setCustOpen(true);
                  }}
                  onBlur={closeCustDropdown}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeCustDropdown();
                  }}
                />
                {custOpen && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface) shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-(--color-muted) hover:bg-(--color-bg)"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectCustomer(null);
                      }}
                    >
                      — Walk-in / no customer —
                    </button>
                    {custMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-(--color-bg)"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCustomer(c);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && (
                          <span className="ml-2 text-(--color-muted)">{c.phone}</span>
                        )}
                      </button>
                    ))}
                    {custMatches.length === 0 && (
                      <div className="px-3 py-2 text-sm text-(--color-muted)">
                        No customers match &ldquo;{custQuery}&rdquo;.
                      </div>
                    )}
                    <button
                      type="button"
                      className="block w-full border-t border-(--color-border) px-3 py-2 text-left text-sm font-medium text-(--color-primary) hover:bg-(--color-bg)"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openNewCustomer(custQuery.trim());
                      }}
                    >
                      <UserPlus className="mr-1.5 inline h-4 w-4" /> Add
                      {custQuery.trim() ? ` "${custQuery.trim()}"` : ""} as new customer
                    </button>
                  </div>
                )}
              </div>
              {customerId && (
                <button
                  type="button"
                  className="btn-outline shrink-0"
                  onClick={openEditCustomer}
                  title="Edit customer"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                className="btn-outline shrink-0"
                onClick={() => (showNewCust ? setShowNewCust(false) : openNewCustomer())}
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

        <Sheet
          open={showNewCust}
          onClose={() => setShowNewCust(false)}
          title={ncEditingId ? "Edit customer" : "Add customer"}
        >
          <div className="space-y-3">
            <input
              className="input"
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input"
                placeholder="Phone *"
                value={nc.phone}
                onChange={(e) => {
                  setNcDuplicate(null);
                  setNc({ ...nc, phone: e.target.value });
                }}
              />
              <input
                className="input"
                placeholder="Email"
                value={nc.email}
                onChange={(e) => setNc({ ...nc, email: e.target.value })}
              />
            </div>
            {ncDuplicate && (
              <div className="rounded-lg border border-(--color-warn) bg-(--color-warn-soft) p-3 text-sm">
                <p>
                  <strong>{ncDuplicate.name}</strong> already has this phone number.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      const existing = custList.find((c) => c.id === ncDuplicate.id);
                      selectCustomer(
                        existing ?? { id: ncDuplicate.id, name: ncDuplicate.name, phone: nc.phone || null, stateCode: TAMIL_NADU_CODE },
                      );
                      setShowNewCust(false);
                      setNcDuplicate(null);
                    }}
                  >
                    Use {ncDuplicate.name} instead
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => addCustomer(true)}>
                    {ncEditingId ? "Save anyway" : "Add as new customer anyway"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => addCustomer()}
                disabled={!nc.name.trim() || !nc.phone.trim()}
              >
                {ncEditingId ? "Save changes" : "Add customer"}
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
        </Sheet>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto" ref={itemsScrollRef}>
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
                    <td colSpan={gstEnabled ? 8 : 7} className="bg-(--color-bg) p-0">
                      {/* A colSpan cell is forced to the table's full (scrollable)
                          width by the auto table-layout algorithm no matter what
                          width we give the <td> itself — so the width cap has to
                          go on this inner sticky wrapper instead, not the cell. */}
                      <div
                        className="sticky left-0 px-4 py-3"
                        style={itemsScrollWidth ? { width: itemsScrollWidth } : undefined}
                      >
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
                        onEdit={(i, text) =>
                          updateRow(r.key, {
                            menuItems: r.menuItems.map((m, mi) => (mi === i ? text : m)),
                          })
                        }
                        onReorder={(from, to) =>
                          updateRow(r.key, {
                            menuItems: reorderItems(r.menuItems, from, to),
                          })
                        }
                      />
                      </div>
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
          {kind === "invoice" && (
            <label className="mb-3 flex items-start gap-2 border-b border-(--color-border) pb-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={showMenuList}
                onChange={(e) => setShowMenuList(e.target.checked)}
              />
              <span>
                Include menu list
                <span className="block text-xs text-(--color-muted)">
                  Prints the dish list pages ahead of the priced invoice.
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
        <button
          className="btn-primary"
          onClick={onSave}
          disabled={pending || !hasValidItems}
          title={
            hasValidItems
              ? undefined
              : "Every line item needs a description, quantity, unit, and rate"
          }
        >
          {pending ? "Saving…" : initial?.id ? "Save changes" : `Create ${kind === "invoice" ? "invoice" : "quotation"}`}
        </button>
        <Link href={base} className="btn-ghost">
          Cancel
        </Link>
      </div>
    </div>
  );
}

function reorderItems<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function MenuItemsEditor({
  eventDate,
  onEventDateChange,
  items,
  onAdd,
  onRemove,
  onEdit,
  onReorder,
}: {
  eventDate: string;
  onEventDateChange: (value: string) => void;
  items: string[];
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
  onEdit: (index: number, text: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function submit() {
    if (draft.trim()) {
      onAdd(draft.trim());
      setDraft("");
    }
  }
  function startEdit(i: number, current: string) {
    setEditingIndex(i);
    setEditDraft(current);
  }
  function saveEdit() {
    if (editingIndex === null) return;
    if (editDraft.trim()) onEdit(editingIndex, editDraft.trim());
    setEditingIndex(null);
    setEditDraft("");
  }
  function endDrag() {
    setDragIndex(null);
    setDragOverIndex(null);
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
      <p className="label mb-2">
        Menu items (printed as a numbered list on the menu page) — drag{" "}
        <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" /> to reorder
      </p>
      {items.length > 0 && (
        <ol className="mb-2 list-decimal space-y-1 pl-8 text-sm">
          {items.map((m, i) =>
            editingIndex === i ? (
              <li key={i}>
                <div className="flex items-center gap-2 py-0.5">
                  <input
                    className="input"
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      } else if (e.key === "Escape") {
                        setEditingIndex(null);
                      }
                    }}
                  />
                  <button type="button" className="btn-outline shrink-0" onClick={saveEdit}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-ghost shrink-0"
                    onClick={() => setEditingIndex(null)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li
                key={i}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) setDragOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
                  endDrag();
                }}
                className={cn(
                  "-ml-2 rounded pl-2 pr-1 transition-colors",
                  dragOverIndex === i && "bg-(--color-primary-soft)",
                  dragIndex === i && "opacity-40",
                )}
              >
                <div className="flex items-center justify-between gap-2 py-1">
                  <span>{m}</span>
                  <div className="flex items-center gap-0.5">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={endDrag}
                      className="cursor-grab px-1 py-0.5 text-(--color-muted) active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <button
                      type="button"
                      className="btn-ghost px-1 py-0.5"
                      title="Edit"
                      onClick={() => startEdit(i, m)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-1 py-0.5"
                      title="Remove"
                      onClick={() => onRemove(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
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

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { saveCustomer, deleteCustomer } from "./actions";
import { Sheet } from "@/components/sheet";

type Cust = {
  id: string;
  name: string;
  gstin: string | null;
  district: string;
  location: string | null;
  phone: string | null;
  email: string | null;
};

const empty = {
  name: "",
  gstin: "",
  district: "Chennai",
  location: "",
  phone: "",
  email: "",
};

export function CustomerManager({ customers }: { customers: Cust[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [f, setF] = useState({ ...empty });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q),
    );
  }, [customers, query]);

  function openCreate() {
    setEditingId(null);
    setF({ ...empty });
    setError(null);
    setDuplicate(null);
    setOpen(true);
  }

  function openEdit(c: Cust) {
    setEditingId(c.id);
    setF({
      name: c.name,
      gstin: c.gstin ?? "",
      district: c.district,
      location: c.location ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    });
    setError(null);
    setDuplicate(null);
    setOpen(true);
  }

  function save(confirmDuplicate = false) {
    setError(null);
    setDuplicate(null);
    start(async () => {
      const res = await saveCustomer({
        ...f,
        id: editingId ?? undefined,
        confirmDuplicate,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else if (res.duplicate) {
        setDuplicate(res.duplicate);
      } else {
        setError(res.error ?? "Could not save");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this customer?")) return;
    start(async () => {
      await deleteCustomer(id);
      router.refresh();
    });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDuplicate(null);
    setF({ ...f, [k]: e.target.value });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
          <input
            className="input pl-9"
            placeholder="Search by name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
          No customers yet. Add one, or create them while making a quotation.
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
          No customers match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">GSTIN</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-(--color-bg)">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-(--color-muted)">{c.gstin ?? "—"}</td>
                  <td className="px-4 py-3 text-(--color-muted)">
                    {[c.location, c.district].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-(--color-muted)">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-ghost" onClick={() => openEdit(c)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost" onClick={() => remove(c.id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Edit customer" : "Add customer"}
      >
        <div className="space-y-3">
          <input className="input" placeholder="Name *" value={f.name} onChange={set("name")} />
          <input className="input" placeholder="GSTIN" value={f.gstin} onChange={set("gstin")} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="District" value={f.district} onChange={set("district")} />
            <input className="input" placeholder="Location (area)" value={f.location} onChange={set("location")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Phone *" value={f.phone} onChange={set("phone")} />
            <input className="input" placeholder="Email" value={f.email} onChange={set("email")} />
          </div>
          <p className="text-xs text-(--color-muted)">State: Tamil Nadu — set automatically.</p>
          {error && <p className="text-sm text-(--color-danger)">{error}</p>}
          {duplicate && (
            <div className="rounded-lg border border-(--color-warn) bg-(--color-warn-soft) p-3 text-sm">
              <p>
                <strong>{duplicate.name}</strong> already has this phone number.
              </p>
              <div className="mt-2 flex gap-2">
                <Link href={`/customers/${duplicate.id}`} className="btn-outline">
                  View {duplicate.name}
                </Link>
                <button className="btn-ghost" onClick={() => save(true)} disabled={pending}>
                  Add as new customer anyway
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex-1"
              onClick={() => save(false)}
              disabled={pending || !f.name.trim() || !f.phone.trim()}
            >
              <UserPlus className="h-4 w-4" />
              {pending ? "Saving…" : editingId ? "Save changes" : "Add customer"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

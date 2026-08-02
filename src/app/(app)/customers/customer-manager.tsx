"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { saveCustomer, deleteCustomer } from "./actions";

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
  addressLine: "",
  district: "Chennai",
  location: "",
  pincode: "",
  phone: "",
  email: "",
};

export function CustomerManager({ customers }: { customers: Cust[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ ...empty });

  function save() {
    setError(null);
    start(async () => {
      const res = await saveCustomer(f);
      if (res.ok) {
        setF({ ...empty });
        router.refresh();
      } else setError(res.error ?? "Could not save");
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this customer?")) return;
    start(async () => {
      await deleteCustomer(id);
      router.refresh();
    });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {customers.length === 0 ? (
          <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
            No customers yet. Add one on the right, or create them while making a quotation.
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
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-(--color-muted)">{c.gstin ?? "—"}</td>
                    <td className="px-4 py-3 text-(--color-muted)">
                      {[c.location, c.district].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-(--color-muted)">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
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
      </div>

      <div className="card h-fit space-y-3 p-4">
        <div className="text-sm font-semibold">Add customer</div>
        <input className="input" placeholder="Name *" value={f.name} onChange={set("name")} />
        <input className="input" placeholder="GSTIN" value={f.gstin} onChange={set("gstin")} />
        <input className="input" placeholder="Address" value={f.addressLine} onChange={set("addressLine")} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="District" value={f.district} onChange={set("district")} />
          <input className="input" placeholder="Location (area)" value={f.location} onChange={set("location")} />
        </div>
        <input className="input" placeholder="PIN" value={f.pincode} onChange={set("pincode")} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Phone" value={f.phone} onChange={set("phone")} />
          <input className="input" placeholder="Email" value={f.email} onChange={set("email")} />
        </div>
        <p className="text-xs text-(--color-muted)">State: Tamil Nadu — set automatically.</p>
        {error && <p className="text-sm text-(--color-danger)">{error}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={pending || !f.name.trim()}>
          <UserPlus className="h-4 w-4" /> Add customer
        </button>
      </div>
    </div>
  );
}

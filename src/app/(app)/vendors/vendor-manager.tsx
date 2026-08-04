"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, UserPlus } from "lucide-react";
import { saveVendor, deleteVendor } from "./actions";
import { fmtMoney } from "@/lib/utils";

type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  district: string;
  location: string | null;
  openingBalance: string;
  purchased: string;
  paid: string;
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
  openingBalance: "",
  notes: "",
};

export function VendorManager({
  vendors,
  currency,
}: {
  vendors: VendorRow[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ ...empty });

  function save() {
    setError(null);
    start(async () => {
      const res = await saveVendor({
        ...f,
        openingBalance: f.openingBalance ? Number(f.openingBalance) : 0,
      });
      if (res.ok) {
        setF({ ...empty });
        router.refresh();
      } else setError(res.error ?? "Could not save");
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this vendor?")) return;
    start(async () => {
      await deleteVendor(id);
      router.refresh();
    });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {vendors.length === 0 ? (
          <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
            No vendors yet. Add one on the right, or pick one while recording a purchase.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 text-right font-medium">Purchased</th>
                  <th className="px-4 py-3 text-right font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {vendors.map((v) => {
                  const due = Number(v.purchased) - Number(v.paid) + Number(v.openingBalance);
                  return (
                    <tr key={v.id} className="hover:bg-(--color-bg)">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/vendors/${v.id}`} className="hover:underline">
                          {v.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">
                        {[v.location, v.district].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtMoney(v.purchased, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {due > 0 ? (
                          <span className="text-(--color-danger)">{fmtMoney(due, currency)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">{v.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="btn-ghost" onClick={() => remove(v.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card h-fit space-y-3 p-4">
        <div className="text-sm font-semibold">Add vendor</div>
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
        <div>
          <label className="mb-1 block text-xs text-(--color-muted)">Opening balance</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={f.openingBalance}
            onChange={set("openingBalance")}
          />
          <p className="mt-1 text-xs text-(--color-muted)">
            Amount already owed to this vendor before adding them here.
          </p>
        </div>
        <textarea
          className="input"
          rows={2}
          placeholder="Notes"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
        <p className="text-xs text-(--color-muted)">State: Tamil Nadu — set automatically.</p>
        {error && <p className="text-sm text-(--color-danger)">{error}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={pending || !f.name.trim()}>
          <UserPlus className="h-4 w-4" /> Add vendor
        </button>
      </div>
    </div>
  );
}

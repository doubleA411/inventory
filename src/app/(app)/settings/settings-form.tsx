"use client";

import { useActionState, useState } from "react";
import { INDIA_STATES } from "@/lib/india-states";
import { updateSettingsAction, type ActionState } from "./actions";

type OrgSettings = {
  name: string;
  legalName: string | null;
  addressLine: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstRegistered: boolean;
  gstin: string | null;
  defaultTaxRate: string;
  defaultSac: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankUpi: string | null;
  invoicePrefix: string;
  quotePrefix: string;
  invoiceStartingNumber: number;
  defaultTerms: string | null;
  defaultNotes: string | null;
};

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  ...rest
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  type?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "name" | "placeholder" | "type"
>) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="input"
        {...rest}
      />
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-(--color-muted)">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsForm({ org }: { org: OrgSettings }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateSettingsAction,
    {},
  );
  const [gstOn, setGstOn] = useState(org.gstRegistered);

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Company profile" desc="Appears on your quotations and bills.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name *" name="name" defaultValue={org.name} required />
          <Field
            label="Legal name"
            name="legalName"
            defaultValue={org.legalName}
            placeholder="As registered"
          />
          <div className="sm:col-span-2">
            <Field
              label="Address"
              name="addressLine"
              defaultValue={org.addressLine}
              placeholder="Street, area"
            />
          </div>
          <Field label="City" name="city" defaultValue={org.city} />
          <div>
            <label className="label" htmlFor="stateCode">
              State
            </label>
            <select
              id="stateCode"
              name="stateCode"
              defaultValue={org.stateCode ?? ""}
              className="input"
            >
              <option value="">— Select state —</option>
              {INDIA_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <Field label="PIN code" name="pincode" defaultValue={org.pincode} />
          <Field label="Phone" name="phone" defaultValue={org.phone} />
          <Field label="Email" name="email" type="email" defaultValue={org.email} />
          <Field label="Website" name="website" defaultValue={org.website} />
        </div>
      </Section>

      <Section
        title="GST & tax"
        desc="Registered businesses issue tax invoices; others issue a bill of supply."
      >
        <label className="mb-4 flex items-center gap-2.5">
          <input
            type="checkbox"
            name="gstRegistered"
            defaultChecked={org.gstRegistered}
            onChange={(e) => setGstOn(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">This business is GST-registered</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={gstOn ? "GSTIN *" : "GSTIN"}
            name="gstin"
            defaultValue={org.gstin}
            placeholder="15-digit GSTIN"
            required={gstOn}
          />
          <Field
            label="Default tax rate (%)"
            name="defaultTaxRate"
            type="number"
            step="any"
            min="0"
            defaultValue={org.defaultTaxRate}
            placeholder="e.g. 5 or 18"
          />
          <Field
            label="Default HSN / SAC"
            name="defaultSac"
            defaultValue={org.defaultSac}
            placeholder="e.g. 996332"
          />
        </div>
      </Section>

      <Section title="Bank details" desc="Shown on invoices for payment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank name" name="bankName" defaultValue={org.bankName} />
          <Field label="Account number" name="bankAccount" defaultValue={org.bankAccount} />
          <Field label="IFSC" name="bankIfsc" defaultValue={org.bankIfsc} />
          <Field label="UPI ID" name="bankUpi" defaultValue={org.bankUpi} />
        </div>
      </Section>

      <Section title="Document defaults" desc="Numbering prefixes and default text.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Invoice number prefix"
            name="invoicePrefix"
            defaultValue={org.invoicePrefix}
            placeholder="INV"
          />
          <Field
            label="Quotation number prefix"
            name="quotePrefix"
            defaultValue={org.quotePrefix}
            placeholder="QUO"
          />
          <div>
            <label className="label" htmlFor="invoiceStartingNumber">
              Last invoice number issued before this app
            </label>
            <input
              id="invoiceStartingNumber"
              name="invoiceStartingNumber"
              type="number"
              min={0}
              step={1}
              defaultValue={org.invoiceStartingNumber}
              placeholder="0"
              className="input"
            />
            <p className="mt-1 text-xs text-(--color-muted)">
              If you&apos;ve already billed customers elsewhere, enter your last bill number
              (e.g. 143) so your next invoice here continues at 144.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="defaultTerms">
              Default terms & conditions
            </label>
            <textarea
              id="defaultTerms"
              name="defaultTerms"
              rows={2}
              defaultValue={org.defaultTerms ?? ""}
              className="input"
              placeholder="e.g. Payment due within 15 days…"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="defaultNotes">
              Default notes
            </label>
            <textarea
              id="defaultNotes"
              name="defaultNotes"
              rows={2}
              defaultValue={org.defaultNotes ?? ""}
              className="input"
            />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-3 shadow-sm">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.error && (
          <span className="text-sm text-(--color-danger)">{state.error}</span>
        )}
        {state.ok && <span className="text-sm text-(--color-ok)">Settings saved.</span>}
      </div>
    </form>
  );
}

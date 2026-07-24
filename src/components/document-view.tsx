import { fmtMoney, fmtDate } from "@/lib/utils";
import { amountInWords } from "@/lib/tax";
import { stateNameByCode } from "@/lib/india-states";
import type { Organization } from "@/lib/db/schema";
// (print: fixed letterhead layer repeats per page; @page margins reserve header/footer)

export type DocOrg = {
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
  logoUrl: string | null;
  letterheadUrl: string | null;
  letterheadMarginTop: string;
  letterheadMarginBottom: string;
  signatureUrl: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankUpi: string | null;
  currency: string;
};

export type DocCustomer = {
  name: string;
  gstin: string | null;
  addressLine: string | null;
  city: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
} | null;

export type DocItem = {
  description: string;
  hsnSac: string | null;
  quantity: string;
  unit: string | null;
  rate: string;
  taxRate: string;
  taxableValue?: string; // invoice only
  amount: string;
};

export type DocData = {
  kind: "quote" | "invoice";
  title: string; // QUOTATION / TAX INVOICE / BILL OF SUPPLY
  number: string;
  issueDate: string;
  secondDateLabel: string;
  secondDate: string | null;
  placeOfSupplyStateCode: string | null;
  reverseCharge?: boolean;
  gstEnabled: boolean;
  intraState: boolean;
  items: DocItem[];
  subtotal: string;
  cgst?: string;
  sgst?: string;
  igst?: string;
  roundOff?: string;
  total: string;
  notes: string | null;
  terms: string | null;
};

function isImage(url: string | null): boolean {
  return !!url && !url.toLowerCase().endsWith(".pdf");
}

export function orgToDocOrg(o: Organization): DocOrg {
  return {
    name: o.name,
    legalName: o.legalName,
    addressLine: o.addressLine,
    city: o.city,
    stateCode: o.stateCode,
    pincode: o.pincode,
    phone: o.phone,
    email: o.email,
    website: o.website,
    gstRegistered: o.gstRegistered,
    gstin: o.gstin,
    logoUrl: o.logoUrl,
    letterheadUrl: o.letterheadUrl,
    letterheadMarginTop: o.letterheadMarginTop,
    letterheadMarginBottom: o.letterheadMarginBottom,
    signatureUrl: o.signatureUrl,
    bankName: o.bankName,
    bankAccount: o.bankAccount,
    bankIfsc: o.bankIfsc,
    bankUpi: o.bankUpi,
    currency: o.currency,
  };
}

export function DocumentView({
  org,
  customer,
  doc,
}: {
  org: DocOrg;
  customer: DocCustomer;
  doc: DocData;
}) {
  const cur = org.currency || "INR";
  const useLetterheadBg = isImage(org.letterheadUrl);
  // Show the generated header whenever we can't lay content over a letterhead
  // image (no letterhead, or an un-convertible PDF) — never leave it blank.
  const showGeneratedHeader = !useLetterheadBg;

  // Content is inset by the user-configured top/bottom margins so it sits in
  // the blank area of the letterhead.
  const pageStyle: React.CSSProperties = useLetterheadBg
    ? {
        paddingTop: `${Number(org.letterheadMarginTop)}px`,
        paddingBottom: `${Number(org.letterheadMarginBottom)}px`,
      }
    : {};

  return (
    <div className="a4-page" style={pageStyle}>
      {useLetterheadBg && org.letterheadUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lh-img" src={org.letterheadUrl} alt="" />
      )}
      <div className="a4-content">
      {showGeneratedHeader && (
        <div className="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logoUrl} alt="" className="h-14 w-14 object-contain" />
            )}
            <div>
              <div className="text-lg font-bold">{org.legalName || org.name}</div>
              <div className="text-xs text-gray-600">
                {[org.addressLine, org.city, stateNameByCode(org.stateCode), org.pincode]
                  .filter(Boolean)
                  .join(", ")}
              </div>
              <div className="text-xs text-gray-600">
                {[org.phone, org.email, org.website].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          {org.gstRegistered && org.gstin && (
            <div className="text-right text-xs">
              <div className="font-semibold">GSTIN</div>
              <div>{org.gstin}</div>
            </div>
          )}
        </div>
      )}

      {/* Title + meta */}
      <div className="mb-4 flex items-start justify-between">
        <h1 className="text-xl font-bold tracking-wide">{doc.title}</h1>
        <table className="text-xs">
          <tbody>
            <tr>
              <td className="pr-3 text-gray-500">No.</td>
              <td className="font-semibold">{doc.number}</td>
            </tr>
            <tr>
              <td className="pr-3 text-gray-500">Date</td>
              <td>{fmtDate(doc.issueDate)}</td>
            </tr>
            {doc.secondDate && (
              <tr>
                <td className="pr-3 text-gray-500">{doc.secondDateLabel}</td>
                <td>{fmtDate(doc.secondDate)}</td>
              </tr>
            )}
            {doc.kind === "invoice" && (
              <tr>
                <td className="pr-3 text-gray-500">Place of supply</td>
                <td>{stateNameByCode(doc.placeOfSupplyStateCode) ?? "—"}</td>
              </tr>
            )}
            {doc.kind === "invoice" && (
              <tr>
                <td className="pr-3 text-gray-500">Reverse charge</td>
                <td>{doc.reverseCharge ? "Yes" : "No"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bill to */}
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase text-gray-500">Bill To</div>
        {customer ? (
          <div className="text-sm">
            <div className="font-semibold">{customer.name}</div>
            <div className="text-xs text-gray-600">
              {[customer.addressLine, customer.city, stateNameByCode(customer.stateCode), customer.pincode]
                .filter(Boolean)
                .join(", ")}
            </div>
            {customer.gstin && <div className="text-xs">GSTIN: {customer.gstin}</div>}
            {customer.phone && <div className="text-xs">Ph: {customer.phone}</div>}
          </div>
        ) : (
          <div className="text-sm text-gray-500">Walk-in / cash</div>
        )}
      </div>

      {/* Items */}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-gray-400 bg-gray-50 text-left">
            <th className="px-1.5 py-1.5">#</th>
            <th className="px-1.5 py-1.5">Description</th>
            <th className="px-1.5 py-1.5">HSN/SAC</th>
            <th className="px-1.5 py-1.5 text-right">Qty</th>
            <th className="px-1.5 py-1.5 text-right">Rate</th>
            {doc.gstEnabled && <th className="px-1.5 py-1.5 text-right">Tax%</th>}
            <th className="px-1.5 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-200 align-top">
              <td className="px-1.5 py-1.5">{i + 1}</td>
              <td className="px-1.5 py-1.5">{it.description}</td>
              <td className="px-1.5 py-1.5">{it.hsnSac || "—"}</td>
              <td className="px-1.5 py-1.5 text-right">
                {Number(it.quantity)} {it.unit ?? ""}
              </td>
              <td className="px-1.5 py-1.5 text-right">{fmtMoney(it.rate, cur)}</td>
              {doc.gstEnabled && (
                <td className="px-1.5 py-1.5 text-right">{Number(it.taxRate)}%</td>
              )}
              <td className="px-1.5 py-1.5 text-right">
                {fmtMoney(it.taxableValue ?? it.amount, cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-3 flex justify-end">
        <table className="text-xs">
          <tbody>
            <tr>
              <td className="pr-6 text-gray-500">Subtotal</td>
              <td className="text-right">{fmtMoney(doc.subtotal, cur)}</td>
            </tr>
            {doc.gstEnabled && doc.intraState && (
              <>
                <tr>
                  <td className="pr-6 text-gray-500">CGST</td>
                  <td className="text-right">{fmtMoney(doc.cgst ?? 0, cur)}</td>
                </tr>
                <tr>
                  <td className="pr-6 text-gray-500">SGST</td>
                  <td className="text-right">{fmtMoney(doc.sgst ?? 0, cur)}</td>
                </tr>
              </>
            )}
            {doc.gstEnabled && !doc.intraState && (
              <tr>
                <td className="pr-6 text-gray-500">IGST</td>
                <td className="text-right">{fmtMoney(doc.igst ?? 0, cur)}</td>
              </tr>
            )}
            {doc.kind === "invoice" && Number(doc.roundOff ?? 0) !== 0 && (
              <tr>
                <td className="pr-6 text-gray-500">Round off</td>
                <td className="text-right">{fmtMoney(doc.roundOff ?? 0, cur)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-400">
              <td className="pr-6 py-1 font-bold">Total</td>
              <td className="py-1 text-right text-sm font-bold">
                {fmtMoney(doc.total, cur)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs">
        <span className="text-gray-500">In words: </span>
        <span className="font-medium">{amountInWords(Number(doc.total))}</span>
      </div>

      {/* Footer: bank, notes/terms, signature */}
      <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
        <div className="space-y-2">
          {doc.kind === "invoice" && (org.bankName || org.bankUpi) && (
            <div>
              <div className="font-semibold uppercase text-gray-500">Bank details</div>
              {org.bankName && <div>Bank: {org.bankName}</div>}
              {org.bankAccount && <div>A/c: {org.bankAccount}</div>}
              {org.bankIfsc && <div>IFSC: {org.bankIfsc}</div>}
              {org.bankUpi && <div>UPI: {org.bankUpi}</div>}
            </div>
          )}
          {doc.terms && (
            <div>
              <div className="font-semibold uppercase text-gray-500">Terms</div>
              <div className="whitespace-pre-line text-gray-700">{doc.terms}</div>
            </div>
          )}
          {doc.notes && <div className="whitespace-pre-line text-gray-700">{doc.notes}</div>}
        </div>
        <div className="flex flex-col items-end justify-end text-right">
          <div className="mb-1 text-gray-600">For {org.legalName || org.name}</div>
          {org.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.signatureUrl} alt="" className="mb-1 h-12 object-contain" />
          )}
          <div className="mt-6 border-t border-gray-400 pt-1">Authorised Signatory</div>
        </div>
      </div>
      </div>
    </div>
  );
}

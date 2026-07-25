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
  headingColor: string;
  bodyColor: string;
  fontSize: number;
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
  menuItems?: string[] | null; // dish names for the menu page
  eventDate?: string | null; // function date this line's menu items belong to
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

// Pack menu line items onto pages using a rough line-count budget, so a page
// fills with as many sessions as fit before the next one moves to a fresh
// page — instead of exactly one session per page, or letting long content
// silently overflow one page's boundary.
const MENU_LINES_PER_PAGE = 34;

function chunkMenuLines(items: DocItem[]): DocItem[][] {
  const pages: DocItem[][] = [];
  let current: DocItem[] = [];
  let currentLines = 0;
  let prevDate: string | null = null;
  for (const it of items) {
    const date = it.eventDate ?? null;
    const linesNeeded = (date && date !== prevDate ? 1 : 0) + 1 + (it.menuItems?.length ?? 0);
    if (current.length > 0 && currentLines + linesNeeded > MENU_LINES_PER_PAGE) {
      pages.push(current);
      current = [];
      currentLines = 0;
      prevDate = null;
    }
    current.push(it);
    currentLines += linesNeeded;
    prevDate = date;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function DocHeader({ org }: { org: DocOrg }) {
  return (
    <div className="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
      <div className="flex items-center gap-3">
        {org.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt="" className="h-14 w-14 object-contain" />
        )}
        <div>
          <div className="doc-text-lg font-bold" style={{ color: org.headingColor }}>
            {org.legalName || org.name}
          </div>
          <div className="doc-text-xs" style={{ color: org.bodyColor }}>
            {[org.addressLine, org.city, stateNameByCode(org.stateCode), org.pincode]
              .filter(Boolean)
              .join(", ")}
          </div>
          <div className="doc-text-xs" style={{ color: org.bodyColor }}>
            {[org.phone, org.email, org.website].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      {org.gstRegistered && org.gstin && (
        <div className="doc-text-xs text-right">
          <div className="font-semibold">GSTIN</div>
          <div>{org.gstin}</div>
        </div>
      )}
    </div>
  );
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
    headingColor: o.docHeadingColor,
    bodyColor: o.docBodyColor,
    fontSize: o.docFontSize,
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

  const menuLines = doc.items.filter((it) => it.menuItems?.length);
  const menuPages = chunkMenuLines(menuLines);
  const contentStyle = { "--doc-base": `${org.fontSize}px` } as React.CSSProperties;
  const headingStyle = { color: org.headingColor };
  const bodyStyle = { color: org.bodyColor };

  return (
    <>
      {menuPages.map((pageItems, pageIdx) => (
        <div key={pageIdx} className="a4-page menu-page" style={pageStyle}>
          {useLetterheadBg && org.letterheadUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lh-img" src={org.letterheadUrl} alt="" />
          )}
          <div className="a4-content" style={contentStyle}>
            {showGeneratedHeader && <DocHeader org={org} />}
            <h1 className="mb-4 doc-text-xl font-bold tracking-wide" style={headingStyle}>
              Menu
            </h1>
            {pageItems.map((it, i) => {
              const date = it.eventDate ?? null;
              const prevDate = i > 0 ? pageItems[i - 1].eventDate ?? null : undefined;
              const showDateHeading = date && (i === 0 || date !== prevDate);
              return (
                <div key={i} className="menu-session">
                  {showDateHeading && (
                    <div
                      className={`mb-2 doc-text-sm font-semibold ${
                        i > 0 ? "mt-4 border-t border-gray-300 pt-2" : ""
                      }`}
                    >
                      {fmtDate(date)}
                    </div>
                  )}
                  <div className="mb-4">
                    <div className="mb-1 doc-text-sm font-semibold">
                      {it.description}
                      {it.unit ? ` · ${Number(it.quantity)} ${it.unit}` : ""}
                    </div>
                    <ol
                      className="list-decimal space-y-0.5 pl-5 doc-text-xs"
                      style={bodyStyle}
                    >
                      {it.menuItems!.map((m, j) => (
                        <li key={j}>{m}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    <div className="a4-page" style={pageStyle}>
      {useLetterheadBg && org.letterheadUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lh-img" src={org.letterheadUrl} alt="" />
      )}
      <div className="a4-content" style={contentStyle}>
      {showGeneratedHeader && <DocHeader org={org} />}

      {/* Title + meta */}
      <div className="mb-4 flex items-start justify-between">
        <h1 className="doc-text-xl font-bold tracking-wide" style={headingStyle}>
          {doc.title}
        </h1>
        <table className="doc-text-xs">
          <tbody>
            <tr>
              <td className="pr-3" style={bodyStyle}>No.</td>
              <td className="font-semibold">{doc.number}</td>
            </tr>
            <tr>
              <td className="pr-3" style={bodyStyle}>Date</td>
              <td>{fmtDate(doc.issueDate)}</td>
            </tr>
            {doc.secondDate && (
              <tr>
                <td className="pr-3" style={bodyStyle}>{doc.secondDateLabel}</td>
                <td>{fmtDate(doc.secondDate)}</td>
              </tr>
            )}
            {doc.kind === "invoice" && (
              <tr>
                <td className="pr-3" style={bodyStyle}>Place of supply</td>
                <td>{stateNameByCode(doc.placeOfSupplyStateCode) ?? "—"}</td>
              </tr>
            )}
            {doc.kind === "invoice" && (
              <tr>
                <td className="pr-3" style={bodyStyle}>Reverse charge</td>
                <td>{doc.reverseCharge ? "Yes" : "No"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bill to */}
      <div className="mb-4">
        <div className="doc-text-xs font-semibold uppercase" style={bodyStyle}>
          Bill To
        </div>
        {customer ? (
          <div className="doc-text-sm">
            <div className="font-semibold">{customer.name}</div>
            <div className="doc-text-xs" style={bodyStyle}>
              {[customer.addressLine, customer.city, stateNameByCode(customer.stateCode), customer.pincode]
                .filter(Boolean)
                .join(", ")}
            </div>
            {customer.gstin && <div className="doc-text-xs">GSTIN: {customer.gstin}</div>}
            {customer.phone && <div className="doc-text-xs">Ph: {customer.phone}</div>}
          </div>
        ) : (
          <div className="doc-text-sm" style={bodyStyle}>
            Walk-in / cash
          </div>
        )}
      </div>

      {/* Items */}
      <table className="w-full border-collapse doc-text-xs">
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
        <table className="doc-text-xs">
          <tbody>
            <tr>
              <td className="pr-6" style={bodyStyle}>Subtotal</td>
              <td className="text-right">{fmtMoney(doc.subtotal, cur)}</td>
            </tr>
            {doc.gstEnabled && doc.intraState && (
              <>
                <tr>
                  <td className="pr-6" style={bodyStyle}>CGST</td>
                  <td className="text-right">{fmtMoney(doc.cgst ?? 0, cur)}</td>
                </tr>
                <tr>
                  <td className="pr-6" style={bodyStyle}>SGST</td>
                  <td className="text-right">{fmtMoney(doc.sgst ?? 0, cur)}</td>
                </tr>
              </>
            )}
            {doc.gstEnabled && !doc.intraState && (
              <tr>
                <td className="pr-6" style={bodyStyle}>IGST</td>
                <td className="text-right">{fmtMoney(doc.igst ?? 0, cur)}</td>
              </tr>
            )}
            {doc.kind === "invoice" && Number(doc.roundOff ?? 0) !== 0 && (
              <tr>
                <td className="pr-6" style={bodyStyle}>Round off</td>
                <td className="text-right">{fmtMoney(doc.roundOff ?? 0, cur)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-400">
              <td className="pr-6 py-1 font-bold">Total</td>
              <td className="py-1 text-right doc-text-sm font-bold">
                {fmtMoney(doc.total, cur)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 doc-text-xs">
        <span style={bodyStyle}>In words: </span>
        <span className="font-medium">{amountInWords(Number(doc.total))}</span>
      </div>

      {/* Footer: bank, notes/terms, signature */}
      <div className="mt-6 grid grid-cols-2 gap-6 doc-text-xs">
        <div className="space-y-2">
          {doc.kind === "invoice" && (org.bankName || org.bankUpi) && (
            <div>
              <div className="font-semibold uppercase" style={bodyStyle}>
                Bank details
              </div>
              {org.bankName && <div>Bank: {org.bankName}</div>}
              {org.bankAccount && <div>A/c: {org.bankAccount}</div>}
              {org.bankIfsc && <div>IFSC: {org.bankIfsc}</div>}
              {org.bankUpi && <div>UPI: {org.bankUpi}</div>}
            </div>
          )}
          {doc.terms && (
            <div>
              <div className="font-semibold uppercase" style={bodyStyle}>
                Terms
              </div>
              <div className="whitespace-pre-line" style={bodyStyle}>
                {doc.terms}
              </div>
            </div>
          )}
          {doc.notes && (
            <div className="whitespace-pre-line" style={bodyStyle}>
              {doc.notes}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end justify-end text-right">
          <div className="mb-1" style={bodyStyle}>For {org.legalName || org.name}</div>
          {org.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.signatureUrl} alt="" className="mb-1 h-12 object-contain" />
          )}
          <div className="mt-6 border-t border-gray-400 pt-1">Authorised Signatory</div>
        </div>
      </div>
      </div>
    </div>
    </>
  );
}

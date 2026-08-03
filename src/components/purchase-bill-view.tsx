import { fmtMoney, fmtDate } from "@/lib/utils";
import { amountInWords } from "@/lib/tax";
import { stateNameByCode } from "@/lib/india-states";
import type { DocOrg, DocPayment } from "@/components/document-view";

export type PurchaseBillVendor = {
  name: string;
  gstin: string | null;
  addressLine: string | null;
  district: string;
  location: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
} | null;

export type PurchaseBillItemView = {
  description: string;
  productId: string | null;
  quantity: string;
  unit: string | null;
  rate: string;
  amount: string;
};

export type PurchaseBillData = {
  number: string;
  billDate: string;
  total: string;
  amountPaid: string;
  notes: string | null;
  items: PurchaseBillItemView[];
  payments: DocPayment[];
};

function isImage(url: string | null): boolean {
  return !!url && !url.toLowerCase().endsWith(".pdf");
}

// Same line-budget pagination idea as layoutPricedPages in document-view.tsx
// — purchase bills are simpler (no tax, no menu section) but a long payment
// history can still overflow a single page, so this is built paginated from
// the start instead of hitting the same bug again later.
const PAGE_BUDGET = 40;
const HEADER_RESERVE = 14; // title/meta + supplier block, page 1 only
const TABLE_HEADER_LINES = 1;
const TOTAL_LINES = 3;
const PAYMENTS_SUMMARY_LINES = 3;
const TAIL_LINES = 6; // in-words + notes

type PageSpec = {
  isFirst: boolean;
  items: PurchaseBillItemView[];
  showTotal: boolean;
  payments: DocPayment[];
  showPaymentsSummary: boolean;
  showTail: boolean;
};

function layoutPages(items: PurchaseBillItemView[], payments: DocPayment[]): PageSpec[] {
  const pages: PageSpec[] = [];
  let pageItems: PurchaseBillItemView[] = [];
  let pagePayments: DocPayment[] = [];
  let showTotal = false;
  let showPaymentsSummary = false;
  let showTail = false;
  let used = HEADER_RESERVE;
  let itemsOpen = false;
  let paymentsOpen = false;

  function flush() {
    pages.push({
      isFirst: pages.length === 0,
      items: pageItems,
      showTotal,
      payments: pagePayments,
      showPaymentsSummary,
      showTail,
    });
    pageItems = [];
    pagePayments = [];
    showTotal = false;
    showPaymentsSummary = false;
    showTail = false;
    used = 0;
    itemsOpen = false;
    paymentsOpen = false;
  }

  for (const it of items) {
    const cost = 1 + (itemsOpen ? 0 : TABLE_HEADER_LINES);
    if (used + cost > PAGE_BUDGET) flush();
    pageItems.push(it);
    used += 1 + (itemsOpen ? 0 : TABLE_HEADER_LINES);
    itemsOpen = true;
  }

  if (used + TOTAL_LINES > PAGE_BUDGET) flush();
  showTotal = true;
  used += TOTAL_LINES;
  itemsOpen = false;

  if (payments.length > 0) {
    for (const p of payments) {
      const cost = 1 + (paymentsOpen ? 0 : TABLE_HEADER_LINES);
      if (used + cost > PAGE_BUDGET) flush();
      pagePayments.push(p);
      used += 1 + (paymentsOpen ? 0 : TABLE_HEADER_LINES);
      paymentsOpen = true;
    }
    if (used + PAYMENTS_SUMMARY_LINES > PAGE_BUDGET) flush();
    showPaymentsSummary = true;
    used += PAYMENTS_SUMMARY_LINES;
  }

  if (used + TAIL_LINES > PAGE_BUDGET) flush();
  showTail = true;

  flush();
  return pages;
}

export function PurchaseBillView({
  org,
  vendor,
  bill,
}: {
  org: DocOrg;
  vendor: PurchaseBillVendor;
  bill: PurchaseBillData;
}) {
  const cur = org.currency || "INR";
  const useLetterheadBg = isImage(org.letterheadUrl);
  const pageStyle: React.CSSProperties = useLetterheadBg
    ? {
        paddingTop: `${Number(org.letterheadMarginTop)}px`,
        paddingBottom: `${Number(org.letterheadMarginBottom)}px`,
      }
    : {};
  const contentStyle = { "--doc-base": `${org.fontSize}px` } as React.CSSProperties;
  const headingStyle = { color: org.headingColor };
  const bodyStyle = { color: org.bodyColor };
  const pages = layoutPages(bill.items, bill.payments);

  return (
    <>
      {pages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className={`a4-page${pageIdx < pages.length - 1 ? " priced-page" : ""}`}
          style={pageStyle}
        >
          {useLetterheadBg && org.letterheadUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lh-img" src={org.letterheadUrl} alt="" />
          )}
          <div className="a4-content" style={contentStyle}>
            {!useLetterheadBg && (
              <div className="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
                <div className="flex items-center gap-3">
                  {org.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logoUrl} alt="" className="h-14 w-14 object-contain" />
                  )}
                  <div>
                    <div className="doc-text-lg font-bold" style={headingStyle}>
                      {org.legalName || org.name}
                    </div>
                    <div className="doc-text-xs" style={bodyStyle}>
                      {[org.addressLine, org.city, stateNameByCode(org.stateCode), org.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {page.isFirst && (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <h1 className="doc-text-xl font-bold tracking-wide" style={headingStyle}>
                    PURCHASE BILL
                  </h1>
                  <table className="doc-text-xs">
                    <tbody>
                      <tr>
                        <td className="pr-3" style={bodyStyle}>No.</td>
                        <td className="font-semibold">{bill.number}</td>
                      </tr>
                      <tr>
                        <td className="pr-3" style={bodyStyle}>Date</td>
                        <td>{fmtDate(bill.billDate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mb-4">
                  <div className="doc-text-xs font-semibold uppercase" style={bodyStyle}>
                    Supplier
                  </div>
                  {vendor ? (
                    <div className="doc-text-sm">
                      <div className="font-semibold">{vendor.name}</div>
                      <div className="doc-text-xs" style={bodyStyle}>
                        {[vendor.addressLine, vendor.location, vendor.district, stateNameByCode(vendor.stateCode), vendor.pincode]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      {vendor.gstin && <div className="doc-text-xs">GSTIN: {vendor.gstin}</div>}
                      {vendor.phone && <div className="doc-text-xs">Ph: {vendor.phone}</div>}
                    </div>
                  ) : (
                    <div className="doc-text-sm" style={bodyStyle}>No vendor on file</div>
                  )}
                </div>
              </>
            )}

            {page.items.length > 0 && (
              <table className="w-full border-collapse doc-text-xs">
                <thead>
                  <tr className="border-y border-gray-400 bg-gray-50 text-left">
                    <th className="px-1.5 py-1.5">#</th>
                    <th className="px-1.5 py-1.5">Description</th>
                    <th className="px-1.5 py-1.5 text-right">Qty</th>
                    <th className="px-1.5 py-1.5 text-right">Rate</th>
                    <th className="px-1.5 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((it, i) => (
                    <tr key={i} className="doc-row border-b border-gray-200 align-top">
                      <td className="px-1.5 py-1.5">{bill.items.indexOf(it) + 1}</td>
                      <td className="px-1.5 py-1.5">{it.description}</td>
                      <td className="px-1.5 py-1.5 text-right">
                        {it.productId ? `${Number(it.quantity)} ${it.unit ?? ""}` : "—"}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">
                        {it.productId ? fmtMoney(it.rate, cur) : "—"}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">{fmtMoney(it.amount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {page.showTotal && (
              <div className="mt-3 flex justify-end doc-noSplit">
                <table className="doc-text-xs">
                  <tbody>
                    <tr className="border-t border-gray-400">
                      <td className="pr-6 py-1 font-bold">Total</td>
                      <td className="py-1 text-right doc-text-sm font-bold">
                        {fmtMoney(bill.total, cur)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {page.payments.length > 0 && (
              <div className="mt-3 flex justify-end">
                <table className="doc-text-xs" style={{ minWidth: "260px" }}>
                  <thead>
                    <tr className="border-b border-gray-400 text-left" style={bodyStyle}>
                      <th className="pr-4 py-1 font-semibold">Date</th>
                      <th className="pr-4 py-1 font-semibold">Method</th>
                      <th className="pr-4 py-1 font-semibold">Reference</th>
                      <th className="py-1 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.payments.map((p, i) => (
                      <tr key={i} className="doc-row border-b border-gray-200">
                        <td className="pr-4 py-1">{fmtDate(p.paidAt)}</td>
                        <td className="pr-4 py-1 capitalize">{p.method.replace("_", " ")}</td>
                        <td className="pr-4 py-1">{p.reference || "—"}</td>
                        <td className="py-1 text-right">{fmtMoney(p.amount, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {page.showPaymentsSummary && (
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="pr-6 pt-1 font-bold">Amount paid</td>
                        <td className="pt-1 text-right font-bold">
                          {fmtMoney(bill.amountPaid, cur)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="pr-6 font-bold">Balance due</td>
                        <td className="text-right font-bold">
                          {fmtMoney(Number(bill.total) - Number(bill.amountPaid), cur)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {page.showTail && (
              <>
                <div className="mt-2 doc-text-xs">
                  <span style={bodyStyle}>In words: </span>
                  <span className="font-medium">{amountInWords(Number(bill.total))}</span>
                </div>
                {bill.notes && (
                  <div className="mt-3 doc-text-xs whitespace-pre-line" style={bodyStyle}>
                    {bill.notes}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

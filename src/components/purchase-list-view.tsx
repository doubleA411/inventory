import { fmtDate } from "@/lib/utils";
import { stateNameByCode } from "@/lib/india-states";
import type { DocOrg } from "@/components/document-view";

export type PurchaseListVendor = {
  name: string;
  gstin: string | null;
  addressLine: string | null;
  district: string;
  location: string | null;
  stateCode: string | null;
  pincode: string | null;
  phone: string | null;
} | null;

export type PurchaseListItemView = {
  description: string;
  quantity: string;
  unit: string | null;
};

export type PurchaseListData = {
  number: string;
  listDate: string;
  notes: string | null;
  items: PurchaseListItemView[];
};

function isImage(url: string | null): boolean {
  return !!url && !url.toLowerCase().endsWith(".pdf");
}

// Same line-budget pagination idea as PurchaseBillView — simpler still, no
// totals or payments to account for, just the item table and a notes tail.
const PAGE_BUDGET = 44;
const HEADER_RESERVE = 14; // title/meta + vendor block, page 1 only
const TABLE_HEADER_LINES = 1;
const TAIL_LINES = 3; // notes

type PageSpec = {
  isFirst: boolean;
  items: PurchaseListItemView[];
  showTail: boolean;
};

function layoutPages(items: PurchaseListItemView[]): PageSpec[] {
  const pages: PageSpec[] = [];
  let pageItems: PurchaseListItemView[] = [];
  let showTail = false;
  let used = HEADER_RESERVE;
  let itemsOpen = false;

  function flush() {
    pages.push({ isFirst: pages.length === 0, items: pageItems, showTail });
    pageItems = [];
    showTail = false;
    used = 0;
    itemsOpen = false;
  }

  for (const it of items) {
    const cost = 1 + (itemsOpen ? 0 : TABLE_HEADER_LINES);
    if (used + cost > PAGE_BUDGET) flush();
    pageItems.push(it);
    used += 1 + (itemsOpen ? 0 : TABLE_HEADER_LINES);
    itemsOpen = true;
  }

  if (used + TAIL_LINES > PAGE_BUDGET) flush();
  showTail = true;

  flush();
  return pages;
}

export function PurchaseListView({
  org,
  vendor,
  list,
}: {
  org: DocOrg;
  vendor: PurchaseListVendor;
  list: PurchaseListData;
}) {
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
  const pages = layoutPages(list.items);

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
                    PURCHASE LIST
                  </h1>
                  <table className="doc-text-xs">
                    <tbody>
                      <tr>
                        <td className="pr-3" style={bodyStyle}>No.</td>
                        <td className="font-semibold">{list.number}</td>
                      </tr>
                      <tr>
                        <td className="pr-3" style={bodyStyle}>Date</td>
                        <td>{fmtDate(list.listDate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mb-4">
                  <div className="doc-text-xs font-semibold uppercase" style={bodyStyle}>
                    Vendor
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
                    <th className="px-1.5 py-1.5">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((it, i) => (
                    <tr key={i} className="doc-row border-b border-gray-200 align-top">
                      <td className="px-1.5 py-1.5">{list.items.indexOf(it) + 1}</td>
                      <td className="px-1.5 py-1.5">{it.description}</td>
                      <td className="px-1.5 py-1.5 text-right">{Number(it.quantity)}</td>
                      <td className="px-1.5 py-1.5">{it.unit ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {page.showTail && list.notes && (
              <div className="mt-3 doc-text-xs whitespace-pre-line" style={bodyStyle}>
                {list.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

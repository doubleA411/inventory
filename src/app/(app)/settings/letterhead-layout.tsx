"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLetterheadMargins } from "./actions";

// Reference A4 page height in CSS px at 96dpi (297mm) — margins are stored in
// these px so the preview maps 1:1 to what prints.
const A4_PX_H = Math.round((297 * 96) / 25.4); // ≈ 1123
const A4_PX_W = Math.round((210 * 96) / 25.4); // ≈ 794
const SIDE_PX = Math.round((14 * 96) / 25.4); // 14mm side inset ≈ 53

const PREVIEW_H = 560;
const SCALE = PREVIEW_H / A4_PX_H;
const PREVIEW_W = A4_PX_W * SCALE;

export function LetterheadLayout({
  letterheadUrl,
  initialTop,
  initialBottom,
  initialCustomerTop,
  initialDocTitleTop,
}: {
  letterheadUrl: string;
  initialTop: number;
  initialBottom: number;
  initialCustomerTop: number;
  initialDocTitleTop: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [top, setTop] = useState(initialTop);
  const [bottom, setBottom] = useState(initialBottom);
  const [customerTop, setCustomerTop] = useState(initialCustomerTop);
  const [docTitleTop, setDocTitleTop] = useState(initialDocTitleTop);
  const [saved, setSaved] = useState(false);
  // Customer-name and title/seller markers are for different physical pages
  // (menu vs. bill/invoice) and never actually appear together — showing
  // both at once in one preview just makes them collide when the two
  // offsets are close, so only one shows at a time.
  const [previewPage, setPreviewPage] = useState<"menu" | "invoice">("menu");

  const topH = top * SCALE;
  const bottomH = bottom * SCALE;
  const customerTopH = customerTop * SCALE;
  const docTitleTopH = docTitleTop * SCALE;

  function save() {
    setSaved(false);
    start(async () => {
      await saveLetterheadMargins(top, bottom, customerTop, docTitleTop);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* A4 preview */}
      <div>
        <div className="mb-2 inline-flex rounded-lg border border-(--color-border) p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setPreviewPage("menu")}
            className={`rounded px-2.5 py-1 ${
              previewPage === "menu"
                ? "bg-amber-500 text-white"
                : "text-(--color-muted) hover:text-(--color-fg)"
            }`}
          >
            Menu page
          </button>
          <button
            type="button"
            onClick={() => setPreviewPage("invoice")}
            className={`rounded px-2.5 py-1 ${
              previewPage === "invoice"
                ? "bg-sky-500 text-white"
                : "text-(--color-muted) hover:text-(--color-fg)"
            }`}
          >
            Bill / invoice page
          </button>
        </div>
        <div
          className="relative overflow-hidden rounded-lg border border-(--color-border) shadow-sm"
          style={{
            width: PREVIEW_W,
            height: PREVIEW_H,
            backgroundImage: `url(${letterheadUrl})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        >
        {/* Reserved (letterhead) zones */}
        <div
          className="absolute inset-x-0 top-0 bg-red-500/15"
          style={{ height: topH }}
        />
        <div
          className="absolute inset-x-0 bottom-0 bg-red-500/15"
          style={{ height: bottomH }}
        />
        {/* Menu-page customer/venue block and the invoice title/seller
            block are on different physical pages and never appear
            together — the toggle above picks which one this preview
            shows, so their markers never collide. */}
        {previewPage === "menu" ? (
          <div
            className="absolute border-t-2 border-dashed border-amber-500"
            style={{ top: customerTopH, left: SIDE_PX * SCALE, right: SIDE_PX * SCALE }}
          >
            <span className="ml-1 inline-block -translate-y-1/2 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-medium text-white">
              Customer name
            </span>
          </div>
        ) : (
          <div
            className="absolute border-t-2 border-dashed border-sky-500"
            style={{ top: docTitleTopH, left: SIDE_PX * SCALE, right: SIDE_PX * SCALE }}
          >
            <span className="ml-1 inline-block -translate-y-1/2 rounded bg-sky-500 px-1.5 py-0.5 text-[9px] font-medium text-white">
              Title &amp; seller details
            </span>
          </div>
        )}
        {/* Content area */}
        <div
          className="absolute border-2 border-dashed border-(--color-primary)"
          style={{
            top: topH,
            bottom: bottomH,
            left: SIDE_PX * SCALE,
            right: SIDE_PX * SCALE,
          }}
        >
          <div className="grid h-full place-items-center">
            <span className="rounded bg-(--color-primary) px-2 py-0.5 text-[10px] font-medium text-white">
              Quote / bill content prints here
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-5">
        <p className="text-sm text-(--color-muted)">
          Drag the sliders so the green content area sits in the blank space of your
          letterhead — clear of the header at the top and any footer at the bottom.
        </p>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label className="font-medium">Top margin (clear the header)</label>
            <span className="tabular-nums text-(--color-muted)">{top}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            value={top}
            onChange={(e) => setTop(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label className="font-medium">Bottom margin (clear the footer)</label>
            <span className="tabular-nums text-(--color-muted)">{bottom}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={400}
            value={bottom}
            onChange={(e) => setBottom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Customer name position (menu page)
            </label>
            <span className="tabular-nums text-(--color-muted)">{customerTop}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            value={customerTop}
            onChange={(e) => setCustomerTop(Number(e.target.value))}
            onFocus={() => setPreviewPage("menu")}
            className="w-full"
          />
          <p className="mt-1 text-xs text-(--color-muted)">
            Where the customer&apos;s name/location prints on the menu page — put it
            beside your logo instead of below it, if there&apos;s room.
          </p>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Title &amp; seller details (bill / invoice)
            </label>
            <span className="tabular-nums text-(--color-muted)">{docTitleTop}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            value={docTitleTop}
            onChange={(e) => setDocTitleTop(Number(e.target.value))}
            onFocus={() => setPreviewPage("invoice")}
            className="w-full"
          />
          <p className="mt-1 text-xs text-(--color-muted)">
            Where the document title and your own name/address/GSTIN print on
            bill of supply / tax invoice pages.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save layout"}
          </button>
          {saved && !pending && (
            <span className="text-sm text-(--color-ok)">Layout saved.</span>
          )}
        </div>
      </div>
    </div>
  );
}

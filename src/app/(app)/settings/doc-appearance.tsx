"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DocumentView, type DocOrg, type DocCustomer, type DocData } from "@/components/document-view";
import { saveDocAppearance } from "./actions";

// Same A4-to-preview scaling as the letterhead layout tool, so both tools
// feel consistent — but here we scale the real DocumentView output itself
// (via CSS transform) rather than a background image.
const A4_PX_H = Math.round((297 * 96) / 25.4);
const A4_PX_W = Math.round((210 * 96) / 25.4);
const PREVIEW_H = 560;
const SCALE = PREVIEW_H / A4_PX_H;
const PREVIEW_W = A4_PX_W * SCALE;

const SAMPLE_ORG_BASE = {
  name: "Sample Caterers",
  legalName: "Sample Caterers Pvt Ltd",
  addressLine: "12 Market Road",
  city: "Chennai",
  stateCode: "33",
  pincode: "600001",
  phone: "+91 90000 00000",
  email: "hello@samplecaterers.in",
  website: "samplecaterers.in",
  gstRegistered: true,
  gstin: "33AAAAA0000A1Z5",
  logoUrl: null,
  letterheadUrl: null,
  letterheadMarginTop: "0",
  letterheadMarginBottom: "0",
  customerBlockTop: "40",
  docTitleTop: "40",
  signatureUrl: null,
  bankName: null,
  bankAccountName: null,
  bankAccount: null,
  bankIfsc: null,
  bankUpi: null,
  currency: "INR",
};

const SAMPLE_CUSTOMER: DocCustomer = {
  name: "Ms. Priya",
  gstin: null,
  addressLine: "45 Anna Nagar",
  district: "Chennai",
  location: "Anna Nagar",
  stateCode: "33",
  pincode: "600040",
  phone: "98765 43210",
};

const SAMPLE_DOC: DocData = {
  kind: "quote",
  title: "QUOTATION",
  number: "QUO/26-27/0001",
  issueDate: new Date().toISOString().slice(0, 10),
  secondDateLabel: "Valid until",
  secondDate: null,
  placeOfSupplyStateCode: "33",
  gstEnabled: true,
  intraState: true,
  items: [
    {
      description: "Dinner",
      hsnSac: null,
      quantity: "150",
      unit: "plates",
      rate: "450",
      taxRate: "5",
      amount: "70875",
    },
    {
      description: "Evening snacks",
      hsnSac: null,
      quantity: "150",
      unit: "plates",
      rate: "80",
      taxRate: "5",
      amount: "12600",
    },
  ],
  subtotal: "78750",
  cgst: "1968.75",
  sgst: "1968.75",
  total: "82688",
  notes: "Thank you for choosing us.",
  terms: "50% advance to confirm the booking.",
};

export function DocAppearance({
  initialHeadingColor,
  initialBodyColor,
  initialFontSize,
}: {
  initialHeadingColor: string;
  initialBodyColor: string;
  initialFontSize: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [headingColor, setHeadingColor] = useState(initialHeadingColor);
  const [bodyColor, setBodyColor] = useState(initialBodyColor);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [saved, setSaved] = useState(false);

  const previewOrg: DocOrg = { ...SAMPLE_ORG_BASE, headingColor, bodyColor, fontSize };

  function save() {
    setSaved(false);
    start(async () => {
      await saveDocAppearance(headingColor, bodyColor, fontSize);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* Live preview */}
      <div
        className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) shadow-sm"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        <div style={{ width: A4_PX_W, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
          <DocumentView org={previewOrg} customer={SAMPLE_CUSTOMER} doc={SAMPLE_DOC} />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-5">
        <p className="text-sm text-(--color-muted)">
          Applies to headings, labels and body text on printed quotations, bills and menus.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Heading color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={headingColor}
                onChange={(e) => setHeadingColor(e.target.value)}
                className="h-9 w-9 shrink-0 rounded border border-(--color-border) p-0.5"
              />
              <input
                className="input"
                value={headingColor}
                onChange={(e) => setHeadingColor(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Body text color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bodyColor}
                onChange={(e) => setBodyColor(e.target.value)}
                className="h-9 w-9 shrink-0 rounded border border-(--color-border) p-0.5"
              />
              <input
                className="input"
                value={bodyColor}
                onChange={(e) => setBodyColor(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <label className="font-medium">Base font size</label>
            <span className="tabular-nums text-(--color-muted)">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={10}
            max={22}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save appearance"}
          </button>
          {saved && !pending && (
            <span className="text-sm text-(--color-ok)">Appearance saved.</span>
          )}
        </div>
      </div>
    </div>
  );
}

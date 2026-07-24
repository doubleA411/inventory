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
}: {
  letterheadUrl: string;
  initialTop: number;
  initialBottom: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [top, setTop] = useState(initialTop);
  const [bottom, setBottom] = useState(initialBottom);
  const [saved, setSaved] = useState(false);

  const topH = top * SCALE;
  const bottomH = bottom * SCALE;

  function save() {
    setSaved(false);
    start(async () => {
      await saveLetterheadMargins(top, bottom);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      {/* A4 preview */}
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

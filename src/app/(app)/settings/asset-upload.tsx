"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText } from "lucide-react";
import { uploadAssetAction } from "./actions";
import { pdfFirstPageToPng } from "@/lib/pdf-to-image";

type Field = "logoUrl" | "letterheadUrl" | "signatureUrl";

export function AssetUpload({
  field,
  label,
  hint,
  accept,
  currentUrl,
  aspect = "square",
  convertPdf = false,
}: {
  field: Field;
  label: string;
  hint?: string;
  accept: string;
  currentUrl: string | null;
  aspect?: "square" | "page" | "wide";
  convertPdf?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "converting" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      let toUpload = file;
      if (convertPdf && file.type === "application/pdf") {
        setStatus("converting");
        toUpload = await pdfFirstPageToPng(file);
      }
      setStatus("uploading");
      const fd = new FormData();
      fd.append("file", toUpload);
      const res = await uploadAssetAction(field, {}, fd);
      if (res.ok) {
        setStatus("done");
        router.refresh();
      } else {
        setStatus("idle");
        setError(res.error ?? "Upload failed");
      }
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Could not process the file.");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const isPdf = currentUrl?.toLowerCase().endsWith(".pdf");
  const boxClass =
    aspect === "page"
      ? "aspect-[1/1.414] w-28"
      : aspect === "wide"
        ? "h-20 w-40"
        : "h-20 w-20";

  const busy = status === "converting" || status === "uploading";

  return (
    <div className="flex items-start gap-4">
      <div
        className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg) ${boxClass}`}
      >
        {currentUrl ? (
          isPdf ? (
            <FileText className="h-8 w-8 text-(--color-muted)" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={label} className="h-full w-full object-contain" />
          )
        ) : (
          <UploadCloud className="h-7 w-7 text-(--color-muted)" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-(--color-muted)">{hint}</div>}
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-(--color-border) file:bg-(--color-surface) file:px-3 file:py-1.5 file:text-sm"
          />
          {status === "converting" && (
            <span className="whitespace-nowrap text-xs text-(--color-muted)">
              Converting PDF…
            </span>
          )}
          {status === "uploading" && (
            <span className="text-xs text-(--color-muted)">Uploading…</span>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-(--color-danger)">{error}</p>}
        {status === "done" && (
          <p className="mt-1 text-xs text-(--color-ok)">Uploaded.</p>
        )}
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-(--color-primary) hover:underline"
          >
            View current
          </a>
        )}
      </div>
    </div>
  );
}

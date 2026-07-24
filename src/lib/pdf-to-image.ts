// Client-side: render the first page of a PDF to a PNG File.
// Used so an uploaded PDF letterhead can be laid under printed documents
// (browsers can't use a PDF as a CSS page background, only an image).

export async function pdfFirstPageToPng(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  // ~150 DPI for a crisp A4 background without an enormous file.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not render the PDF."))),
      "image/png",
    ),
  );
  const name = file.name.replace(/\.pdf$/i, "") + ".png";
  return new File([blob], name, { type: "image/png" });
}

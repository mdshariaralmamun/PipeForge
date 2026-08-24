// Reference underlay (§6): a locked, non-editable layer under the model —
// imported DXF linework or a rasterized PDF page. Session-only by design
// (images can be megabytes; the project autosave goes to localStorage).
export interface ReferenceLayer {
  kind: "dxf" | "pdf";
  name: string; // source file name
  /** DXF linework: flattened x,y pairs per polyline, in drawing units. */
  polylines?: number[][];
  /** PDF page raster (data URL) + pixel dimensions. */
  image?: string;
  imgW?: number;
  imgH?: number;
  /** Scene inches per drawing unit (DXF) or per pixel (PDF). */
  scale: number;
  /** World XZ offset in inches (drawing origin / image top-left maps here). */
  offset: [number, number];
  visible: boolean;
}

/** Render page 1 of a PDF to a PNG data URL at the given DPI. */
export async function rasterizePdfPage(
  data: ArrayBuffer,
  dpi = 150,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
}

// PDF catalog import (§5): extract text with pdf.js, detect candidate part
// entries (part number + fitting keyword + size), and map them onto the
// custom-part templates. Always a pipeline with a manual review step — the
// caller shows the drafts and only commits what the user approves.
import type { CustomTemplate } from "./custom";

export interface CatalogDraft {
  id: string; // stable row id for the review list
  partNumber: string;
  template: CustomTemplate;
  size: string; // OD key from custom.ts ("1/4" | "3/8" | "1/2" | "6mm" | ...)
  brandGuess: string;
  page: number;
  rawLine: string; // source line — shown in the review for confidence
  approved: boolean;
}

export interface CatalogParseResult {
  status: "ok" | "no-text" | "no-candidates" | "error";
  pages: number;
  drafts: CatalogDraft[];
  message?: string;
}

// Fitting-type keywords → app template. Order matters: longer/more specific
// phrases first so "ball valve" wins over bare "valve".
const TYPE_KEYWORDS: [RegExp, CustomTemplate][] = [
  [/needle\s*valve/i, "needle-valve"],
  [/ball\s*valve/i, "ball-valve"],
  [/regulator/i, "regulator"],
  [/gauge|manometer/i, "gauge"],
  [/manifold/i, "manifold"],
  [/elbow/i, "elbow"],
  [/\btee\b/i, "tee"],
  [/\bcross\b/i, "tee"],
  [/valve/i, "ball-valve"],
  [/union|coupling|nipple|connector|reducer|adapter|cap\b|plug|gland/i, "union"],
];

// Part numbers: dashed/slashed tokens mixing letters and digits, e.g.
// SS-400-6, 6L-EL8-316L, DW-1001-1/4x0.035, SS-QC4-D-400. Intentionally
// noisy — the review list is the filter.
const PN_RE = /\b(?=[A-Z0-9.-]*[A-Z])(?=[A-Z0-9./-]*\d)[A-Z0-9]{1,6}(?:[-/][A-Z0-9.]{1,10}){1,5}\b/g;

const SIZE_RE = /\b(1\/8|1\/4|3\/8|1\/2|3\/4)\s*(?:"|in\b)?|(6|8|10|12)\s*mm\b|DN\s?(6|8|10|15)\b/i;
const SCHED_RE = /\bSCH(?:EDULE)?\s?\.?\s?(5|10|40|80|160)S?\b/i;

const KNOWN_BRANDS = [
  "Swagelok", "Parker", "Ham-Let", "Hy-Lok", "Fujikin", "Dockweiler",
  "Vigor", "Uni-Lok", "GCE", "Druva", "Valex", "Wika", "Nupro",
];

function guessSize(line: string): string | null {
  const m = SIZE_RE.exec(line);
  if (!m) return null;
  if (m[1]) {
    // Fractional NPS: the custom templates cover 1/4–1/2; snap the rest.
    const f = m[1];
    if (f === "1/8") return "1/4";
    if (f === "3/4") return "1/2";
    return f;
  }
  if (m[2]) return `${m[2]}mm`;
  const dn = Number(m[3]);
  return dn <= 8 ? "1/4" : dn === 10 ? "3/8" : "1/2";
}

interface PdfLine {
  page: number;
  text: string;
}

async function extractLines(data: ArrayBuffer, maxPages: number): Promise<{ lines: PdfLine[]; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: PdfLine[] = [];
  const pages = Math.min(doc.numPages, maxPages);

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text items into visual lines by their y coordinate.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3; // 3px buckets
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], str: item.str });
      rows.set(y, row);
    }
    for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      const text = row
        .sort((a, b) => a.x - b.x)
        .map((r) => r.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) lines.push({ page: p, text });
    }
  }
  return { lines, pages };
}

export async function parseCatalogPdf(data: ArrayBuffer, maxPages = 25): Promise<CatalogParseResult> {
  let lines: PdfLine[];
  let pages: number;
  try {
    ({ lines, pages } = await extractLines(data, maxPages));
  } catch (e) {
    return {
      status: "error",
      pages: 0,
      drafts: [],
      message: `Could not read the PDF (${e instanceof Error ? e.message : String(e)}).`,
    };
  }

  const totalChars = lines.reduce((a, l) => a + l.text.length, 0);
  if (totalChars < 100) {
    return {
      status: "no-text",
      pages,
      drafts: [],
      message:
        "This PDF has no embedded text (scanned/rasterized). Flag it for manual entry — use the Custom part form instead of guessing.",
    };
  }

  const drafts: CatalogDraft[] = [];
  const seen = new Set<string>();
  // Heading context: last keyword-bearing line without a part number carries
  // the type (and sometimes size) for the table rows below it.
  let heading: { template: CustomTemplate; size: string | null } | null = null;

  for (const line of lines) {
    const kw = TYPE_KEYWORDS.find(([re]) => re.test(line.text));
    PN_RE.lastIndex = 0;
    const pns = [...line.text.matchAll(PN_RE)]
      .map((m) => m[0])
      .filter((t) => t.length >= 5);

    if (pns.length === 0) {
      if (kw) heading = { template: kw[1], size: guessSize(line.text) };
      continue;
    }

    const template = kw?.[1] ?? heading?.template ?? null;
    const size = guessSize(line.text) ?? heading?.size ?? null;
    const sched = SCHED_RE.exec(line.text);
    const brand = KNOWN_BRANDS.find((b) => new RegExp(b, "i").test(line.text)) ?? "";

    for (const pn of pns) {
      const key = `${pn}|${size ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drafts.push({
        id: `d${drafts.length}`,
        partNumber: sched ? `${pn} SCH${sched[1]}` : pn,
        template: template ?? "union",
        size: size ?? "1/4",
        brandGuess: brand,
        page: line.page,
        rawLine: line.text.slice(0, 140),
        approved: template !== null, // unclassified rows need an explicit look
      });
    }
  }

  if (drafts.length === 0) {
    return {
      status: "no-candidates",
      pages,
      drafts: [],
      message:
        "Text was extracted, but no part-number rows matched the fitting taxonomy. Review the catalog manually or use the Custom part form.",
    };
  }
  return { status: "ok", pages, drafts };
}

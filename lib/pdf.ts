// Minimal vector PDF writer — no dependencies. Projects the live viewport
// geometry through the active camera into an A4-landscape line drawing
// (wireframe, so line work stays crisp at any zoom; not a raster screenshot).
import * as THREE from "three";
import type { Centerline, PartGeometry } from "./export3d";

const PAGE_W = 842; // A4 landscape, points
const PAGE_H = 595;
const MARGIN = 36;

interface Pt {
  x: number;
  y: number;
}
interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Project world geometry to page-space edges (part triangles deduplicated). */
function projectEdges(
  parts: PartGeometry[],
  centerlines: Centerline[],
  camera: THREE.Camera,
): { partEdges: Edge[]; centerEdges: Edge[] } {
  camera.updateMatrixWorld(true);
  const inv = camera.matrixWorldInverse;
  const persp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
  const v = new THREE.Vector3();

  // Returns null for points at/behind the near plane (perspective only).
  const projectPoint = (x: number, y: number, z: number): Pt | null => {
    v.set(x, y, z);
    if (persp && v.clone().applyMatrix4(inv).z > -0.05) return null;
    v.project(camera);
    return { x: v.x, y: v.y };
  };

  const partTris: Pt[][] = [];
  for (const p of parts) {
    for (let o = 0; o + 8 < p.tris.length; o += 9) {
      const tri: Pt[] = [];
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const q = projectPoint(p.tris[o + k * 3], p.tris[o + k * 3 + 1], p.tris[o + k * 3 + 2]);
        if (!q) {
          ok = false;
          break;
        }
        tri.push(q);
      }
      if (ok) partTris.push(tri);
    }
  }
  const centerSegs: [Pt, Pt][] = [];
  for (const cl of centerlines) {
    for (let o = 0; o + 5 < cl.seg.length; o += 6) {
      const a = projectPoint(cl.seg[o], cl.seg[o + 1], cl.seg[o + 2]);
      const b = projectPoint(cl.seg[o + 3], cl.seg[o + 4], cl.seg[o + 5]);
      if (a && b) centerSegs.push([a, b]);
    }
  }

  // Fit everything into the page, preserving aspect (room for the title).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: Pt) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  };
  partTris.forEach((t) => t.forEach(grow));
  centerSegs.forEach(([a, b]) => (grow(a), grow(b)));
  if (!isFinite(minX) || maxX - minX < 1e-9 || maxY - minY < 1e-9) {
    return { partEdges: [], centerEdges: [] };
  }
  const scale = Math.min(
    (PAGE_W - 2 * MARGIN) / (maxX - minX),
    (PAGE_H - 2 * MARGIN - 20) / (maxY - minY),
  );
  const ox = MARGIN + (PAGE_W - 2 * MARGIN - (maxX - minX) * scale) / 2;
  const oy = MARGIN + (PAGE_H - 2 * MARGIN - 20 - (maxY - minY) * scale) / 2;
  const map = (p: Pt): Pt => ({ x: ox + (p.x - minX) * scale, y: oy + (p.y - minY) * scale });

  const partEdges: Edge[] = [];
  const seen = new Set<string>();
  const addEdge = (a: Pt, b: Pt) => {
    const k1 = `${a.x.toFixed(1)},${a.y.toFixed(1)}`;
    const k2 = `${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    if (k1 === k2) return;
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    if (seen.has(key)) return;
    seen.add(key);
    partEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  };
  for (const tri of partTris) {
    const m = tri.map(map);
    addEdge(m[0], m[1]);
    addEdge(m[1], m[2]);
    addEdge(m[2], m[0]);
  }
  const centerEdges: Edge[] = centerSegs.map(([a, b]) => {
    const ma = map(a);
    const mb = map(b);
    return { x1: ma.x, y1: ma.y, x2: mb.x, y2: mb.y };
  });
  return { partEdges, centerEdges };
}

const pt = (v: number) => v.toFixed(2);

export function buildPdf(
  parts: PartGeometry[],
  centerlines: Centerline[],
  camera: THREE.Camera,
  viewLabel: string,
): string {
  const { partEdges, centerEdges } = projectEdges(parts, centerlines, camera);

  const content: string[] = [];
  content.push("0.4 w", "0 0 0 RG");
  for (const e of partEdges) content.push(`${pt(e.x1)} ${pt(e.y1)} m ${pt(e.x2)} ${pt(e.y2)} l`);
  if (partEdges.length > 0) content.push("S");
  content.push("0.5 w", "0.75 0.15 0.15 RG");
  for (const e of centerEdges) content.push(`${pt(e.x1)} ${pt(e.y1)} m ${pt(e.x2)} ${pt(e.y2)} l`);
  if (centerEdges.length > 0) content.push("S");
  content.push(
    "0 0 0 RG",
    `BT /F1 12 Tf ${MARGIN} ${PAGE_H - 24} Td (PipeForge — ${escapeText(viewLabel)} view — ${escapeText(
      new Date().toISOString().slice(0, 10),
    )}) Tj ET`,
    `BT /F1 8 Tf ${MARGIN} 18 Td (${escapeText(
      `${parts.length} parts — wireframe vector export (hidden lines not removed)`,
    )}) Tj ET`,
  );
  const stream = content.join("\n");

  // Assemble the file, tracking byte offsets for the xref table (ASCII only).
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return pdf;
}

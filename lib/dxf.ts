// Minimal ASCII DXF (AC1021 / AutoCAD 2000) writer — no dependencies.
// Layers: PARTS (solid surfaces as 3DFACE), CENTERLINES (port-to-port
// skeleton), LABELS (part numbers as TEXT). Units are scene inches.
import type { Centerline, PartGeometry } from "./export3d";

const n = (v: number): string => {
  const s = v.toFixed(4);
  return s.replace(/\.?0+$/, "") || "0";
};

class Dxf {
  private lines: string[] = [];
  pair(code: number, value: string | number): this {
    this.lines.push(String(code), String(value));
    return this;
  }
  text(): string {
    return this.lines.join("\n") + "\n";
  }
}

function face(d: Dxf, layer: string, t: number[], o: number): void {
  d.pair(0, "3DFACE").pair(8, layer);
  // 4th corner duplicates the 3rd for triangular faces.
  for (let corner = 0; corner < 4; corner++) {
    const k = o + Math.min(corner, 2) * 3;
    d.pair(10 + corner, n(t[k])).pair(20 + corner, n(t[k + 1])).pair(30 + corner, n(t[k + 2]));
  }
}

function line(d: Dxf, layer: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
  d.pair(0, "LINE")
    .pair(8, layer)
    .pair(10, n(x1)).pair(20, n(y1)).pair(30, n(z1))
    .pair(11, n(x2)).pair(21, n(y2)).pair(31, n(z2));
}

export function buildDxf(parts: PartGeometry[], centerlines: Centerline[]): string {
  const d = new Dxf();

  d.pair(0, "SECTION").pair(2, "HEADER")
    .pair(9, "$ACADVER").pair(1, "AC1021")
    .pair(9, "$INSUNITS").pair(70, 1) // inches
    .pair(0, "ENDSEC");

  d.pair(0, "SECTION").pair(2, "TABLES")
    .pair(0, "TABLE").pair(2, "LAYER").pair(70, 3);
  for (const [name, color] of [["PARTS", 7], ["CENTERLINES", 1], ["LABELS", 3]] as const) {
    d.pair(0, "LAYER").pair(2, name).pair(70, 0).pair(62, color).pair(6, "CONTINUOUS");
  }
  d.pair(0, "ENDTAB").pair(0, "ENDSEC");

  d.pair(0, "SECTION").pair(2, "ENTITIES");

  for (const p of parts) {
    for (let o = 0; o + 8 < p.tris.length; o += 9) face(d, "PARTS", p.tris, o);
    // Label at the first triangle's centroid — good enough to find the part.
    if (p.tris.length >= 9) {
      const cx = (p.tris[0] + p.tris[3] + p.tris[6]) / 3;
      const cy = (p.tris[1] + p.tris[4] + p.tris[7]) / 3;
      const cz = (p.tris[2] + p.tris[5] + p.tris[8]) / 3;
      d.pair(0, "TEXT")
        .pair(8, "LABELS")
        .pair(10, n(cx)).pair(20, n(cy + 0.3)).pair(30, n(cz))
        .pair(40, 0.25)
        .pair(1, p.partNumber);
    }
  }

  for (const cl of centerlines) {
    for (let o = 0; o + 5 < cl.seg.length; o += 6) {
      line(d, "CENTERLINES", cl.seg[o], cl.seg[o + 1], cl.seg[o + 2], cl.seg[o + 3], cl.seg[o + 4], cl.seg[o + 5]);
    }
  }

  d.pair(0, "ENDSEC").pair(0, "EOF");
  return d.text();
}

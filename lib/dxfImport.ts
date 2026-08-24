// DXF underlay parsing (§6): extract 2D reference geometry (LINE, LWPOLYLINE,
// POLYLINE, CIRCLE, ARC) from an ASCII DXF into flat polylines in drawing
// units. Curves become chord polylines; ellipses/splines/hatches are skipped
// (underlay reference only, not a full DXF reader).
export interface DxfUnderlay {
  /** Flattened x,y pairs per polyline: [x1, y1, x2, y2, ...]. */
  polylines: number[][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  skipped: number; // entities we intentionally ignored
}

interface Pair {
  code: number;
  value: string;
}

function* pairs(text: string): Generator<Pair> {
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isNaN(code)) yield { code, value: lines[i + 1].trim() };
  }
}

const ARC_STEPS_PER_90 = 8;

function arcPoly(cx: number, cy: number, r: number, a0: number, a1: number, closed: boolean): number[] {
  let sweep = a1 - a0;
  if (closed) sweep = 360;
  while (sweep < 0) sweep += 360;
  const steps = Math.max(4, Math.round((sweep / 90) * ARC_STEPS_PER_90));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + (sweep * i) / steps) * Math.PI) / 180;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

export function parseDxfUnderlay(text: string): DxfUnderlay | null {
  const toks = [...pairs(text)];
  const polylines: number[][] = [];
  let skipped = 0;

  // Find the ENTITIES section.
  let i = 0;
  while (i < toks.length && !(toks[i].code === 2 && toks[i].value === "ENTITIES")) i++;
  if (i >= toks.length) return null;

  const num = (v: string | undefined): number => {
    const n = parseFloat(v ?? "");
    return Number.isFinite(n) ? n : 0;
  };

  while (i < toks.length) {
    // Advance to the next entity start (group code 0).
    if (toks[i].code !== 0) {
      i++;
      continue;
    }
    const type = toks[i].value;
    i++;
    // Collect this entity's pairs until the next code-0 (or ENDSEC/EOF).
    const start = i;
    while (i < toks.length && toks[i].code !== 0) i++;
    const ent = toks.slice(start, i);
    if (type === "ENDSEC" || type === "EOF") break;

    const get = (code: number): string | undefined => ent.find((p) => p.code === code)?.value;

    if (type === "LINE") {
      polylines.push([num(get(10)), num(get(20)), num(get(11)), num(get(21))]);
    } else if (type === "LWPOLYLINE") {
      const pts: number[] = [];
      for (let k = 0; k < ent.length; k++) {
        if (ent[k].code === 10) {
          const y = ent.slice(k + 1).find((p) => p.code === 20);
          pts.push(num(ent[k].value), num(y?.value));
        }
      }
      const closed = (parseInt(get(70) ?? "0", 10) & 1) === 1;
      if (closed && pts.length >= 4) pts.push(pts[0], pts[1]);
      if (pts.length >= 4) polylines.push(pts);
    } else if (type === "POLYLINE") {
      const closed = (parseInt(get(70) ?? "0", 10) & 1) === 1;
      const pts: number[] = [];
      // Old-style sequence: 0 VERTEX entities until 0 SEQEND.
      while (i < toks.length && toks[i].code === 0 && toks[i].value === "VERTEX") {
        i++;
        const vstart = i;
        while (i < toks.length && toks[i].code !== 0) i++;
        const vent = toks.slice(vstart, i);
        pts.push(
          num(vent.find((p) => p.code === 10)?.value),
          num(vent.find((p) => p.code === 20)?.value),
        );
      }
      if (i < toks.length && toks[i].code === 0 && toks[i].value === "SEQEND") i++;
      if (closed && pts.length >= 4) pts.push(pts[0], pts[1]);
      if (pts.length >= 4) polylines.push(pts);
    } else if (type === "CIRCLE") {
      polylines.push(arcPoly(num(get(10)), num(get(20)), num(get(40)), 0, 360, true));
    } else if (type === "ARC") {
      polylines.push(
        arcPoly(num(get(10)), num(get(20)), num(get(40)), num(get(50)), num(get(51)), false),
      );
    } else {
      skipped++;
    }
  }

  if (polylines.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polylines) {
    for (let k = 0; k + 1 < pl.length; k += 2) {
      minX = Math.min(minX, pl[k]); maxX = Math.max(maxX, pl[k]);
      minY = Math.min(minY, pl[k + 1]); maxY = Math.max(maxY, pl[k + 1]);
    }
  }
  return { polylines, bounds: { minX, minY, maxX, maxY }, skipped };
}

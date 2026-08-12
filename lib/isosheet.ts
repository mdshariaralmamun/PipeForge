// Dimensioned isometric drawing sheet (A3 landscape SVG): iso-projected pipe
// centerlines with face-to-face dimensions, part labels, weld + bend schedules,
// MTO table, installation safety notes, and a title block.
import { buildMto } from "./assembly";
import { computeBends, safetyNotes } from "./bends";
import { nodeGeom, svgDoc, svgLine, svgText } from "./drawing";
import type { PlacedComponent } from "./types";
import { computeWelds } from "./welds";

const W = 1587; // A3 landscape at 96 dpi
const H = 1123;
const MTO_TOP = H - 320;
const RIGHT_X = W - 420; // weld/bend schedule column
const TITLE_X = W - 370;

// Isometric projection: world Y up -> SVG y down; +X down-right, +Z down-left.
function proj(p: [number, number, number]): [number, number] {
  return [(p[0] - p[2]) * 0.8660254, -p[1] + (p[0] + p[2]) * 0.5];
}

export function isoSheetSvg(placed: PlacedComponent[]): string {
  if (placed.length === 0) {
    return svgDoc(500, 220, svgText(250, 110, "No parts placed", 14));
  }

  const nodes = placed.map(nodeGeom).filter((n): n is NonNullable<typeof n> => n !== null);

  // Fit the projected assembly into the drawing region (right column reserved).
  const pts: [number, number][] = [];
  for (const n of nodes) {
    pts.push(proj(n.origin));
    for (const pt of n.ports) pts.push(proj(pt.world));
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const drawW = RIGHT_X - 140;
  const drawH = MTO_TOP - 140;
  const k = Math.min(
    drawW / Math.max(maxX - minX, 0.001),
    drawH / Math.max(maxY - minY, 0.001),
    30, // don't blow up a single tiny part
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ox = 70 + drawW / 2;
  const oy = 70 + drawH / 2;
  const P = (p: [number, number, number]): [number, number] => {
    const [sx, sy] = proj(p);
    return [ox + (sx - cx) * k, oy + (sy - cy) * k];
  };

  let body = svgText(60, 52, "PIPEFORGE — ISOMETRIC ASSEMBLY", 14, "start", 'font-weight="bold"');

  // Pipe centerlines: each part's port-to-port path, dimensioned face-to-face.
  for (const n of nodes) {
    if (n.ports.length >= 2) {
      const a = P(n.ports[0].world);
      for (let i = 1; i < n.ports.length; i++) {
        const b = P(n.ports[i].world);
        body += svgLine(a[0], a[1], b[0], b[1], 2.5);
        const w0 = n.ports[0].world;
        const w1 = n.ports[i].world;
        const din = Math.hypot(w1[0] - w0[0], w1[1] - w0[1], w1[2] - w0[2]);
        body += svgText(
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2 - 6,
          `${din.toFixed(2)} in (${Math.round(din * 25.4)} mm)`,
          9,
        );
      }
    }
    const o = P(n.origin);
    body += `<circle cx="${o[0].toFixed(1)}" cy="${o[1].toFixed(1)}" r="3" fill="#111"/>`;
    body += svgText(o[0], o[1] + 18, n.partNumber, 9);
  }

  // Weld joint markers (orange) + bend tags (violet) on the drawing.
  const welds = computeWelds(placed);
  for (const j of welds) {
    const [wx, wy] = P(j.position);
    body += `<circle cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="5" fill="none" stroke="#d97706" stroke-width="1.5"/>`;
    body += `<circle cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="1.5" fill="#d97706"/>`;
    body += `<text x="${(wx + 8).toFixed(1)}" y="${(wy - 6).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="#b45309">${j.id}</text>`;
  }
  const bends = computeBends(placed);
  for (const b of bends) {
    const [bx, by] = P(b.position);
    body += `<text x="${(bx + 8).toFixed(1)}" y="${(by + 14).toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="bold" fill="#7c3aed">${b.id}</text>`;
  }

  // --- right column: weld schedule + bend schedule --------------------------
  let ry = 84;
  body += svgText(RIGHT_X, ry, "WELD SCHEDULE — ORBITAL GTAW", 11, "start", 'font-weight="bold"');
  ry += 20;
  if (welds.length === 0) {
    body += svgText(RIGHT_X, ry, "— none —", 9, "start");
    ry += 18;
  } else {
    body += svgText(RIGHT_X, ry, "WELD", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 45, ry, "OD", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 100, ry, "WALL", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 155, ry, "ID", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 215, ry, "DETAIL", 8, "start", 'font-weight="bold"');
    welds.slice(0, 8).forEach((j, i) => {
      const y = ry + 16 + i * 15;
      body += svgText(RIGHT_X, y, j.id, 8, "start");
      body += svgText(RIGHT_X + 45, y, j.od.toFixed(3), 8, "start");
      body += svgText(RIGHT_X + 100, y, j.wall.toFixed(3), 8, "start");
      body += svgText(RIGHT_X + 155, y, j.idia.toFixed(3), 8, "start");
      body += svgText(RIGHT_X + 215, y, j.detail.slice(0, 24), 8, "start");
    });
    ry += 16 + Math.min(welds.length, 8) * 15 + 6;
    if (welds.length > 8) {
      body += svgText(RIGHT_X, ry, `… +${welds.length - 8} more`, 8, "start", 'font-style="italic"');
      ry += 14;
    }
  }

  ry += 22;
  body += svgText(RIGHT_X, ry, "BEND SCHEDULE (90 deg)", 11, "start", 'font-weight="bold"');
  ry += 20;
  if (bends.length === 0) {
    body += svgText(RIGHT_X, ry, "— none —", 9, "start");
  } else {
    body += svgText(RIGHT_X, ry, "BEND", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 45, ry, "OD", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 100, ry, "R", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 150, ry, "ARC", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 205, ry, "SETBACK", 8, "start", 'font-weight="bold"');
    body += svgText(RIGHT_X + 270, ry, "GAIN", 8, "start", 'font-weight="bold"');
    bends.slice(0, 8).forEach((b, i) => {
      const y = ry + 16 + i * 15;
      body += svgText(RIGHT_X, y, b.id, 8, "start");
      body += svgText(RIGHT_X + 45, y, b.od.toFixed(3), 8, "start");
      body += svgText(RIGHT_X + 100, y, b.radius.toFixed(2), 8, "start");
      body += svgText(RIGHT_X + 150, y, b.arcLen.toFixed(2), 8, "start");
      body += svgText(RIGHT_X + 205, y, b.setback.toFixed(2), 8, "start");
      body += svgText(RIGHT_X + 270, y, b.gain.toFixed(2), 8, "start");
    });
    if (bends.length > 8) {
      body += svgText(RIGHT_X, ry + 16 + 8 * 15, `… +${bends.length - 8} more`, 8, "start", 'font-style="italic"');
    }
  }

  // --- bottom-left: MTO + installation/safety notes --------------------------
  const lines = buildMto(placed);
  body += svgLine(40, MTO_TOP, RIGHT_X - 30, MTO_TOP, 1);
  body += svgText(60, MTO_TOP + 24, "MATERIAL TAKE-OFF", 12, "start", 'font-weight="bold"');
  const headY = MTO_TOP + 46;
  body += svgText(60, headY, "PART NUMBER", 9, "start", 'font-weight="bold"');
  body += svgText(330, headY, "DESCRIPTION", 9, "start", 'font-weight="bold"');
  body += svgText(830, headY, "SIZE", 9, "start", 'font-weight="bold"');
  body += svgText(950, headY, "QTY", 9, "start", 'font-weight="bold"');
  body += svgText(1010, headY, "ORDER NOTE", 9, "start", 'font-weight="bold"');
  body += svgLine(60, headY + 6, RIGHT_X - 40, headY + 6, 0.75);
  const maxRows = 8;
  lines.slice(0, maxRows).forEach((l, i) => {
    const y = headY + 22 + i * 17;
    body += svgText(60, y, l.partNumber, 9, "start");
    body += svgText(330, y, l.description.slice(0, 52), 9, "start");
    body += svgText(830, y, l.size, 9, "start");
    body += svgText(950, y, String(l.qty), 9, "start");
    body += svgText(1010, y, (l.orderNote ?? "").slice(0, 24), 8, "start");
  });
  if (lines.length > maxRows) {
    body += svgText(60, headY + 22 + maxRows * 17, `… +${lines.length - maxRows} more lines`, 9, "start", 'font-style="italic"');
  }

  const notes = safetyNotes(placed);
  notes.forEach((n, i) => {
    body += svgText(60, H - 66 + i * 13, `${i === 0 ? "INSTALLATION & SAFETY: " : ""}${n}`, 8, "start", i === 0 ? "" : "");
  });

  // Title block, bottom right.
  body += `<rect x="${TITLE_X}" y="${H - 130}" width="330" height="90" fill="none" stroke="#111" stroke-width="1.5"/>`;
  body += svgText(TITLE_X + 165, H - 106, "PIPEFORGE", 13, "middle", 'font-weight="bold"');
  body += svgText(TITLE_X + 165, H - 86, "ISOMETRIC ASSEMBLY DRAWING", 9);
  body += svgText(TITLE_X + 165, H - 68, `Date: ${new Date().toISOString().slice(0, 10)}`, 9);
  body += svgText(TITLE_X + 165, H - 52, `Parts: ${placed.length}   Units: inches`, 9);

  // Sheet frame.
  body += `<rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#111" stroke-width="2"/>`;

  return svgDoc(W, H, body);
}

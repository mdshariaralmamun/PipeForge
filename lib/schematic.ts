// 2D P&ID-style schematic: layered BFS layout of the connection graph,
// standard-ish symbols per part shape, part-number labels. Output is an SVG string.
import { getDef } from "./catalog";
import type { PlacedComponent } from "./types";
import { esc, svgDoc, svgLine, svgText } from "./drawing";

const COL_W = 200;
const ROW_H = 110;
const MARGIN = 80;

// Symbol glyphs, drawn centered on (x, y). Black on white, print-friendly.
function symbol(shape: string, x: number, y: number): string {
  switch (shape) {
    case "ball-valve":
    case "needle-valve":
    case "pneu-valve":
      // bowtie (valve)
      return `<path d="M ${x - 16} ${y - 11} L ${x + 16} ${y + 11} L ${x + 16} ${y - 11} L ${x - 16} ${y + 11} Z" fill="#fff" stroke="#111" stroke-width="1.8"/>`;
    case "regulator":
      return (
        `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="#111" stroke-width="1.8"/>` +
        svgText(x, y + 4, "R", 11)
      );
    case "gauge":
    case "upright":
      return (
        `<circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#111" stroke-width="1.8"/>` +
        svgText(x, y + 3.5, shape === "gauge" ? "G" : "I", 9)
      );
    case "tee":
      return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#111"/>`;
    case "elbow":
      return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#111" transform="rotate(45 ${x} ${y})"/>`;
    case "stub":
    case "sleeve":
      return svgLine(x - 16, y, x + 16, y, 6);
    case "cap":
      return (
        `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#fff" stroke="#111" stroke-width="1.8"/>` +
        svgLine(x - 6, y - 6, x + 6, y + 6, 1.4)
      );
    default:
      // union / connector / fconnector / nipple / gland / reducer
      return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="#fff" stroke="#111" stroke-width="1.8"/>`;
  }
}

export function schematicSvg(placed: PlacedComponent[]): string {
  if (placed.length === 0) {
    return svgDoc(420, 200, svgText(210, 100, "No parts placed", 14));
  }

  // Undirected adjacency from the connection records.
  const adj = new Map<string, string[]>();
  for (const p of placed) adj.set(p.uid, []);
  for (const p of placed) {
    for (const c of p.connections) {
      if (adj.has(c.otherUid)) {
        adj.get(p.uid)!.push(c.otherUid);
        adj.get(c.otherUid)!.push(p.uid);
      }
    }
  }

  // Forest BFS: column = graph depth, row = visit order in that column.
  // Disconnected trees get their own column block to the right.
  const pos = new Map<string, { x: number; y: number }>();
  const colRows = new Map<number, number>();
  let colOffset = 0;
  let maxX = 0;
  let maxY = 0;

  for (const start of placed) {
    if (pos.has(start.uid)) continue;
    const assign: [string, number][] = [];
    const queue: [string, number][] = [[start.uid, 0]];
    pos.set(start.uid, { x: -1, y: -1 }); // visited marker
    let treeMaxDepth = 0;
    while (queue.length > 0) {
      const [uid, d] = queue.shift()!;
      assign.push([uid, d]);
      treeMaxDepth = Math.max(treeMaxDepth, d);
      for (const n of adj.get(uid) ?? []) {
        if (!pos.has(n)) {
          pos.set(n, { x: -1, y: -1 });
          queue.push([n, d + 1]);
        }
      }
    }
    for (const [uid, d] of assign) {
      const col = colOffset + d;
      const row = colRows.get(col) ?? 0;
      colRows.set(col, row + 1);
      const x = MARGIN + col * COL_W;
      const y = MARGIN + row * ROW_H;
      pos.set(uid, { x, y });
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    colOffset += treeMaxDepth + 2;
  }

  let body = svgText(MARGIN, 40, "PIPEFORGE — SYSTEM SCHEMATIC", 14, "start", 'font-weight="bold"');

  // Edges first so symbols sit on top.
  const seen = new Set<string>();
  for (const p of placed) {
    for (const c of p.connections) {
      const key = [p.uid, c.otherUid].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = pos.get(p.uid);
      const b = pos.get(c.otherUid);
      if (a && b) body += svgLine(a.x, a.y, b.x, b.y, 2);
    }
  }

  // Nodes with hover tooltip (part number + description).
  for (const p of placed) {
    const at = pos.get(p.uid);
    if (!at) continue;
    const def = getDef(p.defId);
    const shape = def?.shape ?? "union";
    const pn = def?.partNumber ?? p.defId;
    const desc = def ? `${def.partNumber} — ${def.description}` : p.defId;
    body += `<g><title>${esc(desc)}</title>${symbol(shape, at.x, at.y)}</g>`;
    body += svgText(at.x, at.y + 32, pn, 9);
  }

  return svgDoc(maxX + MARGIN + 60, maxY + MARGIN + 60, body);
}

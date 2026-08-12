// Placement geometry helpers: bounding-sphere overlap checks.
// Connected parts are allowed to touch; anything else may not overlap.
import { getDef } from "./catalog";
import type { PlacedComponent } from "./types";

// Rotation-invariant bounding radius from the def's key dimensions.
export function boundRadius(defId: string, lengthOverride?: number): number {
  const def = getDef(defId);
  if (!def) return 0.5;
  const d = def.dims;
  const len = lengthOverride ?? d.len ?? 0;
  const candidates = [
    len,
    d.blockW ?? 0,
    d.blockH ?? 0,
    (d.leg ?? 0) * 1.5,
    (d.portX ?? 0) * 2,
    d.bodyDia ?? 0,
    d.dia ?? 0,
    d.caseDia ?? 0,
    (d.stemLen ?? 0) + (d.bodyH ?? 0),
  ];
  return Math.max(...candidates, 0.4) / 2;
}

// True when a and b overlap and are NOT directly connected to each other.
export function overlaps(a: PlacedComponent, b: PlacedComponent): boolean {
  if (a.connections.some((c) => c.otherUid === b.uid)) return false;
  if (b.connections.some((c) => c.otherUid === a.uid)) return false;
  const ra = boundRadius(a.defId, a.lengthOverride);
  const rb = boundRadius(b.defId, b.lengthOverride);
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  // 15% slack: nested fittings (e.g. nut against body) should not flag.
  return Math.hypot(dx, dy, dz) < (ra + rb) * 0.85;
}

// First part that `candidate` would overlap, or null when the spot is free.
export function anyOverlap(
  candidate: PlacedComponent,
  placed: PlacedComponent[],
): PlacedComponent | null {
  for (const p of placed) {
    if (p.uid === candidate.uid) continue;
    if (overlaps(candidate, p)) return p;
  }
  return null;
}

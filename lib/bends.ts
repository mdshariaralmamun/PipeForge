// Pipe bend math (standard shop formulas) + installation safety notes.
//
// For a 90 deg bend with centerline radius R:
//   bend allowance (arc)  = theta * R            (theta in radians)
//   setback / tangent     = R * tan(theta / 2)   ( = R for 90 deg )
//   gain                  = 2 * setback - arc
import { getDef } from "./catalog";
import type { PlacedComponent } from "./types";

export interface BendEntry {
  id: string; // B1, B2, ...
  partNumber: string;
  od: number; // inches
  radius: number; // centerline radius, inches
  angleDeg: number;
  arcLen: number; // bend allowance
  setback: number; // tangent length to bend intersection
  gain: number;
  position: [number, number, number];
  method: string;
}

export function computeBends(placed: PlacedComponent[]): BendEntry[] {
  const out: BendEntry[] = [];
  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def || def.shape !== "elbow") continue;
    const R = def.dims.leg ?? 0.75; // centerline radius (port face to bend center)
    const theta = (90 * Math.PI) / 180;
    const arc = R * theta;
    const setback = R * Math.tan(theta / 2);
    out.push({
      id: "",
      partNumber: def.partNumber,
      od: def.dims.bodyDia ?? def.dims.dia ?? 0.25,
      radius: R,
      angleDeg: 90,
      arcLen: arc,
      setback,
      gain: 2 * setback - arc,
      position: p.position,
      method:
        def.family === "uhp-tube"
          ? "Prefab elbow, orbital GTAW"
          : def.family === "plastic"
            ? "Prefab elbow, heat fusion"
            : "90 deg elbow fitting",
    });
  }
  out.forEach((b, i) => {
    b.id = `B${i + 1}`;
  });
  return out;
}

// Installation & safety notes driven by which piping systems are in the model.
export function safetyNotes(placed: PlacedComponent[]): string[] {
  const fams = new Set<string>();
  const ends = new Set<string>();
  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def) continue;
    fams.add(def.family);
    for (const pt of def.ports) ends.add(pt.endType);
  }
  const notes: string[] = [];
  if (fams.has("uhp-tube") || fams.has("uhp")) {
    notes.push(
      "UHP: cleanroom gloves, ends capped until weld; orbital GTAW per qualified WPS; 99.999% Ar purge. He leak test <1e-9 mbar l/s before service.",
    );
  }
  if (fams.has("plastic")) {
    notes.push(
      "PP-H/HDPE: heat fusion per DVS 2207 (element ~210 C); observe heat/soak/cooling times; no load on fresh joints.",
    );
  }
  if (ends.has("npt-m") || ends.has("npt-f")) {
    notes.push("NPT: PTFE tape / approved sealant; no liquid sealant downstream of UHP purifiers.");
  }
  if (fams.has("support")) {
    notes.push(
      "Supports: anchor to structure per load calc; maintain slope/drain; never hang other services from gas lines.",
    );
  }
  notes.push(
    "General: depressurize + purge before work; PPE per site permit; leak-test completed system before handover.",
  );
  return notes.slice(0, 4);
}

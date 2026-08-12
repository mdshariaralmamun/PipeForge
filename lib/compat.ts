import type { ComponentDef, EndType, PortDef } from "./types";

// Which end types can mate with each other.
// - tube compression stubs join stub-to-stub (union / fitting body)
// - NPT joins male <-> female
// - face-seal joins male gland <-> female body/nut
// - butt weld joins weld-to-weld (orbital weld)
export function endTypesMate(a: EndType, b: EndType): boolean {
  if (a === b)
    return a === "tube-comp" || a === "weld" || a === "fuse" || a === "flange";
  return (
    (a === "npt-m" && b === "npt-f") ||
    (a === "npt-f" && b === "npt-m") ||
    (a === "fs-m" && b === "fs-f") ||
    (a === "fs-f" && b === "fs-m")
  );
}

// Two ports are compatible when their end types mate and sizes match.
export function portsCompatible(a: PortDef, b: PortDef): boolean {
  return a.size === b.size && endTypesMate(a.endType, b.endType);
}

export const END_TYPE_LABEL: Record<EndType, string> = {
  "tube-comp": "Tube compression",
  "npt-m": "NPT male",
  "npt-f": "NPT female",
  "fs-m": "Face-seal male (VCR)",
  "fs-f": "Face-seal female (VCR)",
  weld: "Tube butt weld",
  fuse: "Heat fusion (socket/butt)",
  flange: "Flanged",
};

export interface AdapterSuggestion {
  def: ComponentDef;
  note: string; // how it bridges the two sides
}

// Real-world joint rule: if `desired` cannot mate with `target`, find catalog
// parts that could bridge them (one port matching each side) — the transition
// fitting you would actually reach for (reducer, adapter, union).
export function findAdapters(
  target: PortDef,
  desired: ComponentDef,
  pool: ComponentDef[],
): AdapterSuggestion[] {
  const out: AdapterSuggestion[] = [];
  for (const def of pool) {
    if (def.id === desired.id) continue;
    const aSide = def.ports.find((p) => portsCompatible(target, p));
    const bSide = def.ports.find(
      (p) => p !== aSide && desired.ports.some((dp) => portsCompatible(p, dp)),
    );
    if (aSide && bSide) {
      out.push({
        def,
        note: `${aSide.endType} ${aSide.size} -> ${bSide.endType} ${bSide.size}`,
      });
    }
    if (out.length >= 3) break;
  }
  return out;
}

// User-defined custom catalog parts: parametric templates (incl. VMB-style
// manifolds) plus localStorage persistence so custom parts survive reloads.
import { tubeDims } from "./catalog";
import type { Brand, ComponentDef, EndType, PortDef, Vec3 } from "./types";

export type CustomTemplate =
  | "union"
  | "elbow"
  | "tee"
  | "ball-valve"
  | "needle-valve"
  | "regulator"
  | "gauge"
  | "manifold";

export const TEMPLATES: { value: CustomTemplate; label: string }[] = [
  { value: "union", label: "Union / straight" },
  { value: "elbow", label: "Elbow 90°" },
  { value: "tee", label: "Tee" },
  { value: "ball-valve", label: "Ball valve" },
  { value: "needle-valve", label: "Needle valve" },
  { value: "regulator", label: "Pressure regulator" },
  { value: "gauge", label: "Pressure gauge" },
  { value: "manifold", label: "Manifold block (VMB-style)" },
];

export interface CustomInput {
  partNumber: string;
  description: string;
  brand: string;
  template: CustomTemplate;
  size: string;
  endType: EndType;
  outlets: number; // manifold only
}

const OD: Record<string, number> = {
  "1/4": 0.25,
  "3/8": 0.375,
  "1/2": 0.5,
  "6mm": 0.236,
  "8mm": 0.315,
  "10mm": 0.394,
  "12mm": 0.472,
};

const KNOWN_BRANDS: Brand[] = [
  "Swagelok",
  "Uni-Lok",
  "Vigor",
  "Dockweiler",
  "GCE Druva",
  "Generic",
];

const slug = (pn: string) =>
  pn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function port(
  id: string,
  position: Vec3,
  direction: Vec3,
  endType: EndType,
  size: string,
): PortDef {
  return { id, position, direction, endType, size };
}

export function buildCustomDef(input: CustomInput): ComponentDef {
  const t = OD[input.size] ?? 0.25;
  const brand: Brand = (KNOWN_BRANDS as string[]).includes(input.brand)
    ? (input.brand as Brand)
    : "Generic";
  const et = input.endType;
  const base = {
    partNumber: input.partNumber.trim(),
    brand,
    description:
      input.description.trim() || `Custom ${input.template}, ${input.size}`,
    material: "316 SS",
    sizeLabel: `${input.size} OD`,
  };
  const { bodyDia, nutDia, nutLen } = tubeDims(t);
  let def: Omit<ComponentDef, "id">;

  switch (input.template) {
    case "union": {
      const len = 1.15 + 1.5 * t;
      def = {
        ...base,
        family: "tube",
        shape: "union",
        dims: { len, bodyDia, nutDia, nutLen },
        ports: [
          port("p1", [-len / 2, 0, 0], [-1, 0, 0], et, input.size),
          port("p2", [len / 2, 0, 0], [1, 0, 0], et, input.size),
        ],
      };
      break;
    }
    case "elbow": {
      const leg = 2.6 * t + 0.3;
      def = {
        ...base,
        family: "tube",
        shape: "elbow",
        dims: { leg, bodyDia, nutDia, nutLen },
        ports: [
          port("p1", [leg, 0, 0], [1, 0, 0], et, input.size),
          port("p2", [0, leg, 0], [0, 1, 0], et, input.size),
        ],
      };
      break;
    }
    case "tee": {
      const leg = 2.6 * t + 0.3;
      def = {
        ...base,
        family: "tube",
        shape: "tee",
        dims: { leg, bodyDia, nutDia, nutLen },
        ports: [
          port("p1", [-leg, 0, 0], [-1, 0, 0], et, input.size),
          port("p2", [leg, 0, 0], [1, 0, 0], et, input.size),
          port("p3", [0, leg, 0], [0, 1, 0], et, input.size),
        ],
      };
      break;
    }
    case "ball-valve": {
      const bodyW = 1.4;
      const portX = bodyW / 2 + 0.45 + nutLen / 2;
      def = {
        ...base,
        family: "valve",
        shape: "ball-valve",
        dims: {
          portX,
          bodyW,
          bodyH: 0.95,
          bodyD: 0.85,
          tubeDia: 1.6 * t + 0.12,
          nutDia,
          nutLen,
          stemDia: 0.22,
          handleLen: 1.5,
        },
        ports: [
          port("p1", [-portX, 0, 0], [-1, 0, 0], et, input.size),
          port("p2", [portX, 0, 0], [1, 0, 0], et, input.size),
        ],
      };
      break;
    }
    case "needle-valve": {
      const portX = 0.55 + nutLen / 2 + 0.3;
      def = {
        ...base,
        family: "valve",
        shape: "needle-valve",
        dims: { portX, bodyDia: 0.8, nutDia, nutLen, bonnetDia: 0.5, stemH: 0.9, knobDia: 0.8 },
        ports: [
          port("p1", [-portX, 0, 0], [-1, 0, 0], et, input.size),
          port("p2", [portX, 0, 0], [1, 0, 0], et, input.size),
        ],
      };
      break;
    }
    case "regulator": {
      const portX = 1.15;
      def = {
        ...base,
        family: "regulator",
        shape: "regulator",
        dims: {
          bodyDia: 1.5,
          bodyH: 1.0,
          bonnetDia: 0.9,
          bonnetH: 0.5,
          knobDia: 1.1,
          knobH: 0.55,
          portX,
          portDia: 0.5,
        },
        ports: [
          port("p1", [-portX, 0, 0], [-1, 0, 0], et, input.size),
          port("p2", [portX, 0, 0], [1, 0, 0], et, input.size),
        ],
      };
      break;
    }
    case "gauge": {
      def = {
        ...base,
        family: "instrument",
        shape: "gauge",
        dims: { caseDia: 2.0, caseDepth: 0.9, stemLen: 0.6, stemDia: 0.3 },
        ports: [port("p1", [0, 0, 0], [0, -1, 0], et, input.size)],
      };
      break;
    }
    case "manifold": {
      // VMB-style block: one inlet on the -X end, N outlets along the top.
      const n = Math.min(8, Math.max(2, Math.round(input.outlets) || 4));
      const spacing = 1.0;
      const blockW = (n - 1) * spacing + 1.6;
      const blockH = 0.9;
      const blockD = 0.9;
      const stubLen = 0.45;
      const stubDia = Math.max(0.22, 1.4 * t);
      const ports: PortDef[] = [
        port("p1", [-blockW / 2 - stubLen, 0, 0], [-1, 0, 0], et, input.size),
      ];
      for (let i = 0; i < n; i++) {
        const x = -blockW / 2 + 0.8 + i * spacing;
        ports.push(port(`o${i + 1}`, [x, blockH / 2 + stubLen, 0], [0, 1, 0], et, input.size));
      }
      def = {
        ...base,
        family: "uhp",
        shape: "block",
        dims: { blockW, blockH, blockD, stubLen, stubDia },
        ports,
      };
      break;
    }
    default:
      throw new Error(`Unknown template: ${input.template}`);
  }

  return { ...def, id: `custom-${slug(base.partNumber) || "part"}-${Date.now().toString(36)}` };
}

// --- persistence -------------------------------------------------------------

export const CUSTOM_STORAGE_KEY = "pipeforge-custom-parts-v1";

export function serializeCustomDefs(defs: ComponentDef[]): string {
  return JSON.stringify(defs);
}

export function parseCustomDefs(json: string): ComponentDef[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return (v as ComponentDef[]).filter(
      (d) =>
        d &&
        typeof d.id === "string" &&
        typeof d.partNumber === "string" &&
        Array.isArray(d.ports),
    );
  } catch {
    return [];
  }
}

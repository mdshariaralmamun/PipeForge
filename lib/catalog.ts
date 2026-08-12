import type { Brand, ComponentDef, EndType, PortDef, Vec3 } from "./types";

// ---------------------------------------------------------------------------
// PipeForge seed catalog.
//
// Dimensions are APPROXIMATE engineering values (inches) chosen so the
// procedural meshes look plausible — they are NOT certified catalog data.
// Edit anything here freely; the whole catalog lives in this one file.
// ---------------------------------------------------------------------------

export const MATERIAL = "316 SS";

function port(
  id: string,
  position: Vec3,
  direction: Vec3,
  endType: EndType,
  size: string,
): PortDef {
  return { id, position, direction, endType, size };
}

const slug = (pn: string) => pn.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Shared proportions for tube compression nuts/bodies, from tube OD t.
export function tubeDims(t: number) {
  return {
    bodyDia: 1.7 * t + 0.1,
    nutDia: 2.1 * t + 0.12,
    nutLen: 0.9 * t + 0.1,
  };
}

// Approximate outside diameter of NPT pipe thread.
const NPT_OD: Record<string, number> = { "1/4": 0.54, "3/8": 0.675, "1/2": 0.84 };

// --- tube compression builders --------------------------------------------

function tubeUnion(partNumber: string, brand: Brand, size: string, t: number): ComponentDef {
  const len = 1.15 + 1.5 * t;
  const { bodyDia, nutDia, nutLen } = tubeDims(t);
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "union",
    description: `Union, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { len, bodyDia, nutDia, nutLen },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "tube-comp", size),
    ],
  };
}

function reducingUnion(
  partNumber: string,
  brand: Brand,
  sizeA: string,
  tA: number,
  sizeB: string,
  tB: number,
): ComponentDef {
  const len = 1.45 + 1.5 * Math.max(tA, tB);
  const { bodyDia, nutDia, nutLen } = tubeDims(Math.max(tA, tB));
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "union",
    description: `Reducing union, ${sizeA} x ${sizeB} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${sizeA} x ${sizeB} in OD`,
    dims: { len, bodyDia, nutDia, nutLen },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", sizeA),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "tube-comp", sizeB),
    ],
  };
}

function tubeElbow(partNumber: string, brand: Brand, size: string, t: number): ComponentDef {
  const leg = 2.6 * t + 0.3; // port face to center of bend
  const { bodyDia, nutDia, nutLen } = tubeDims(t);
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "elbow",
    description: `Union elbow 90 deg, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { leg, bodyDia, nutDia, nutLen },
    ports: [
      port("p1", [leg, 0, 0], [1, 0, 0], "tube-comp", size),
      port("p2", [0, leg, 0], [0, 1, 0], "tube-comp", size),
    ],
  };
}

function tubeTee(partNumber: string, brand: Brand, size: string, t: number): ComponentDef {
  const leg = 2.6 * t + 0.3;
  const { bodyDia, nutDia, nutLen } = tubeDims(t);
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "tee",
    description: `Union tee, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { leg, bodyDia, nutDia, nutLen },
    ports: [
      port("p1", [-leg, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [leg, 0, 0], [1, 0, 0], "tube-comp", size),
      port("p3", [0, leg, 0], [0, 1, 0], "tube-comp", size),
    ],
  };
}

function maleConnector(
  partNumber: string,
  brand: Brand,
  size: string,
  t: number,
  nptSize: string,
): ComponentDef {
  const len = 1.05 + 1.2 * t;
  const { nutDia, nutLen } = tubeDims(t);
  const threadDia = NPT_OD[nptSize];
  const threadLen = 0.4 + 0.3 * t;
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "connector",
    description: `Male connector, ${size} in tube OD x ${nptSize} in MNPT`,
    material: MATERIAL,
    sizeLabel: `${size} OD x ${nptSize} NPT`,
    dims: { len, nutDia, nutLen, hexDia: threadDia * 1.35, threadDia, threadLen },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-m", nptSize),
    ],
  };
}

function femaleConnector(
  partNumber: string,
  brand: Brand,
  size: string,
  t: number,
  nptSize: string,
): ComponentDef {
  const len = 0.95 + 1.1 * t;
  const { nutDia, nutLen } = tubeDims(t);
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "fconnector",
    description: `Female connector, ${size} in tube OD x ${nptSize} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} OD x ${nptSize} NPT`,
    dims: { len, nutDia, nutLen, hexDia: NPT_OD[nptSize] * 1.3 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-f", nptSize),
    ],
  };
}

function tubeTerminator(
  partNumber: string,
  brand: Brand,
  size: string,
  t: number,
  kind: "Cap" | "Plug",
): ComponentDef {
  const { nutDia, nutLen } = tubeDims(t);
  const len = nutLen + 0.25;
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "tube",
    shape: "cap",
    description: `${kind}, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { len, nutDia, nutLen },
    ports: [port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", size)],
  };
}

// --- NPT pipe fitting builders ---------------------------------------------

function hexNipple(partNumber: string, size: string, len: number): ComponentDef {
  const od = NPT_OD[size];
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "nipple",
    description: `Hex nipple, ${size} in MNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { len, hexDia: od * 1.2, threadDia: od, threadLen: 0.4 + 0.25 * od },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "npt-m", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-m", size),
    ],
  };
}

function nptElbow(partNumber: string, size: string): ComponentDef {
  const leg = 0.9;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "elbow",
    description: `Elbow 90 deg, ${size} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { leg, bodyDia: NPT_OD[size], nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [leg, 0, 0], [1, 0, 0], "npt-f", size),
      port("p2", [0, leg, 0], [0, 1, 0], "npt-f", size),
    ],
  };
}

function streetElbow(partNumber: string, size: string): ComponentDef {
  const leg = 0.95;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "elbow",
    description: `Street elbow 90 deg, ${size} in MNPT x FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { leg, bodyDia: NPT_OD[size] * 0.95, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [leg, 0, 0], [1, 0, 0], "npt-m", size),
      port("p2", [0, leg, 0], [0, 1, 0], "npt-f", size),
    ],
  };
}

function nptTee(partNumber: string, size: string): ComponentDef {
  const leg = 0.9;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "tee",
    description: `Tee, ${size} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { leg, bodyDia: NPT_OD[size], nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [-leg, 0, 0], [-1, 0, 0], "npt-f", size),
      port("p2", [leg, 0, 0], [1, 0, 0], "npt-f", size),
      port("p3", [0, leg, 0], [0, 1, 0], "npt-f", size),
    ],
  };
}

function coupling(partNumber: string, size: string): ComponentDef {
  const od = NPT_OD[size];
  const len = 1.15;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "nipple",
    description: `Coupling, ${size} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { len, hexDia: od * 1.25, threadDia: od, threadLen: 0 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "npt-f", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-f", size),
    ],
  };
}

function hexBushing(partNumber: string, sizeM: string, sizeF: string): ComponentDef {
  const od = NPT_OD[sizeM];
  const len = 1.0;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "nipple",
    description: `Hex bushing, ${sizeM} in MNPT x ${sizeF} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${sizeM}M x ${sizeF}F NPT`,
    dims: { len, hexDia: od * 1.25, threadDia: od, threadLen: 0.5 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "npt-f", sizeF),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-m", sizeM),
    ],
  };
}

function pipePlug(partNumber: string, size: string): ComponentDef {
  const od = NPT_OD[size];
  const len = 0.65;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "nipple",
    description: `Hex head plug, ${size} in MNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { len, hexDia: od * 1.15, threadDia: od, threadLen: 0.35 },
    ports: [port("p2", [len / 2, 0, 0], [1, 0, 0], "npt-m", size)],
  };
}

function pipeCap(partNumber: string, size: string): ComponentDef {
  const od = NPT_OD[size];
  const len = 0.7;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "npt",
    shape: "cap",
    description: `Cap, ${size} in FNPT`,
    material: MATERIAL,
    sizeLabel: `${size} in NPT`,
    dims: { len, nutDia: od * 1.25, nutLen: 0.4 },
    ports: [port("p1", [-len / 2, 0, 0], [-1, 0, 0], "npt-f", size)],
  };
}

// --- valves / instruments builders ------------------------------------------

function ballValve(
  partNumber: string,
  brand: Brand,
  size: string,
  t: number,
  big = false,
): ComponentDef {
  const { nutDia, nutLen } = tubeDims(t);
  const s = big ? 1.25 : 1;
  const bodyW = 1.4 * s;
  const portX = bodyW / 2 + 0.45 + nutLen / 2;
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "valve",
    shape: "ball-valve",
    description: `Ball valve, 2-way, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: {
      portX,
      bodyW,
      bodyH: 0.95 * s,
      bodyD: 0.85 * s,
      tubeDia: 1.6 * t + 0.12,
      nutDia,
      nutLen,
      stemDia: 0.22 * s,
      handleLen: 1.5 * s,
    },
    ports: [
      port("p1", [-portX, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [portX, 0, 0], [1, 0, 0], "tube-comp", size),
    ],
  };
}

function needleValve(
  partNumber: string,
  brand: Brand,
  size: string,
  t: number,
  desc?: string,
): ComponentDef {
  const { nutDia, nutLen } = tubeDims(t);
  const portX = 0.55 + nutLen / 2 + 0.3;
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "valve",
    shape: "needle-valve",
    description: desc ?? `Needle valve, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { portX, bodyDia: 0.8, nutDia, nutLen, bonnetDia: 0.5, stemH: 0.9, knobDia: 0.8 },
    ports: [
      port("p1", [-portX, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [portX, 0, 0], [1, 0, 0], "tube-comp", size),
    ],
  };
}

// --- Dockweiler UHP tube system (orbital-weld ends) ---------------------------

const DW_MATERIAL = "316L (1.4435)";
type DwGrade = "ULTRON" | "TCC";

function dwPn(article: number, size: string, wall: string, grade: DwGrade): string {
  return `DW-${article}-${size}x${wall}-1.4435-${grade}`;
}

function dwDesc(grade: DwGrade, what: string, size: string, wall: string): string {
  const g = grade === "ULTRON" ? "UHP electropolished" : "TCC bright-annealed";
  return `${g} ${what}, ${size} OD x ${wall} wall, orbital-weld ends`;
}

function dwTube(
  article: number,
  grade: DwGrade,
  size: string,
  od: number,
  wall: string,
): ComponentDef {
  const len = 6; // scene-scale length (real tubes ship ~6 m)
  // Wall in inches for the weld spec (metric walls are given in mm).
  const wallIn = size.endsWith("mm") ? parseFloat(wall) / 25.4 : parseFloat(wall);
  return {
    id: slug(dwPn(article, size, wall, grade)),
    partNumber: dwPn(article, size, wall, grade),
    brand: "Dockweiler",
    family: "uhp-tube",
    shape: "stub",
    description: dwDesc(grade, "tube", size, wall),
    material: DW_MATERIAL,
    sizeLabel: `${size} OD`,
    dims: { len, dia: od, wall: wallIn },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "weld", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "weld", size),
    ],
    stretchable: true,
    stdLen: 6,
  };
}

function dwWeldElbow(
  article: number,
  grade: DwGrade,
  size: string,
  od: number,
  wall: string,
): ComponentDef {
  const leg = 3 * od + 0.25;
  return {
    id: slug(dwPn(article, size, wall, grade)),
    partNumber: dwPn(article, size, wall, grade),
    brand: "Dockweiler",
    family: "uhp-tube",
    shape: "elbow",
    description: dwDesc(grade, "elbow 90 deg", size, wall),
    material: DW_MATERIAL,
    sizeLabel: `${size} OD`,
    dims: { leg, bodyDia: od, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [leg, 0, 0], [1, 0, 0], "weld", size),
      port("p2", [0, leg, 0], [0, 1, 0], "weld", size),
    ],
  };
}

function dwWeldTee(
  article: number,
  grade: DwGrade,
  size: string,
  od: number,
  wall: string,
): ComponentDef {
  const leg = 3 * od + 0.25;
  return {
    id: slug(dwPn(article, size, wall, grade)),
    partNumber: dwPn(article, size, wall, grade),
    brand: "Dockweiler",
    family: "uhp-tube",
    shape: "tee",
    description: dwDesc(grade, "tee", size, wall),
    material: DW_MATERIAL,
    sizeLabel: `${size} OD`,
    dims: { leg, bodyDia: od, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [-leg, 0, 0], [-1, 0, 0], "weld", size),
      port("p2", [leg, 0, 0], [1, 0, 0], "weld", size),
      port("p3", [0, leg, 0], [0, 1, 0], "weld", size),
    ],
  };
}

function dwWeldUnion(
  article: number,
  grade: DwGrade,
  size: string,
  od: number,
  wall: string,
): ComponentDef {
  const len = 6 * od + 0.4;
  return {
    id: slug(dwPn(article, size, wall, grade)),
    partNumber: dwPn(article, size, wall, grade),
    brand: "Dockweiler",
    family: "uhp-tube",
    shape: "sleeve",
    description: dwDesc(grade, "weld union", size, wall),
    material: DW_MATERIAL,
    sizeLabel: `${size} OD`,
    dims: { len, dia: od, bandDia: od * 1.7 + 0.06, bandLen: 0.22 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "weld", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "weld", size),
    ],
  };
}

function dwWeldReducer(
  article: number,
  grade: DwGrade,
  sizeA: string,
  odA: number,
  sizeB: string,
  odB: number,
  wall: string,
): ComponentDef {
  const len = 1.5 * odA + 0.4;
  return {
    id: slug(dwPn(article, `${sizeA}x${sizeB}`, wall, grade)),
    partNumber: dwPn(article, `${sizeA}x${sizeB}`, wall, grade),
    brand: "Dockweiler",
    family: "uhp-tube",
    shape: "reducer",
    description: dwDesc(grade, "concentric reducer", `${sizeA} x ${sizeB}`, wall),
    material: DW_MATERIAL,
    sizeLabel: `${sizeA} x ${sizeB} OD`,
    dims: { len, diaA: odA, diaB: odB },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "weld", sizeA),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "weld", sizeB),
    ],
  };
}

// --- GCE Druva regulators & POU hardware --------------------------------------

function gceRegulator(
  partNumber: string,
  description: string,
  size: string,
  inType: EndType,
  outType: EndType,
  scale = 1,
): ComponentDef {
  const portX = 1.15 * scale;
  return {
    id: slug(partNumber),
    partNumber,
    brand: "GCE Druva",
    family: "regulator",
    shape: "regulator",
    description,
    material: DW_MATERIAL,
    sizeLabel: `${size} in/out`,
    dims: {
      bodyDia: 1.5 * scale,
      bodyH: 1.0 * scale,
      bonnetDia: 0.9 * scale,
      bonnetH: 0.5 * scale,
      knobDia: 1.1 * scale,
      knobH: 0.55 * scale,
      portX,
      portDia: 0.5 * scale,
    },
    ports: [
      port("p1", [-portX, 0, 0], [-1, 0, 0], inType, size),
      port("p2", [portX, 0, 0], [1, 0, 0], outType, size),
    ],
  };
}

function diaphragmValve(partNumber: string, brand: Brand, size: string): ComponentDef {
  const portX = 0.9;
  return {
    id: slug(partNumber),
    partNumber,
    brand,
    family: "valve",
    shape: "pneu-valve",
    description: `Diaphragm shut-off valve, ${size} in face-seal male`,
    material: DW_MATERIAL,
    sizeLabel: `${size} in VCR`,
    dims: { portX, bodyW: 1.1, bodyH: 0.7, bodyD: 0.7, canDia: 0.85, canH: 1.0 },
    ports: [
      port("p1", [-portX, 0, 0], [-1, 0, 0], "fs-m", size),
      port("p2", [portX, 0, 0], [1, 0, 0], "fs-m", size),
    ],
  };
}

function uprightDevice(
  partNumber: string,
  description: string,
  sizeLabel: string,
  endType: EndType,
  size: string,
  dims: { stemDia: number; stemLen: number; bodyDia: number; bodyH: number },
): ComponentDef {
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "instrument",
    shape: "upright",
    description,
    material: MATERIAL,
    sizeLabel,
    dims,
    ports: [port("p1", [0, 0, 0], [0, -1, 0], endType, size)],
  };
}

function checkValve(partNumber: string, size: string, t: number): ComponentDef {
  const len = 1.3 + 1.5 * t;
  const { bodyDia, nutDia, nutLen } = tubeDims(t);
  return {
    id: slug(partNumber),
    partNumber,
    brand: "Generic",
    family: "valve",
    shape: "union",
    description: `Check valve, ${size} in tube OD`,
    material: MATERIAL,
    sizeLabel: `${size} in OD`,
    dims: { len, bodyDia, nutDia, nutLen },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "tube-comp", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "tube-comp", size),
    ],
  };
}

// --- Plastic piping systems (PP-H / HDPE), heat-fusion joints ------------------

function plasticPipe(
  pn: string,
  material: string,
  finish: "plastic" | "hdpe",
  odMm: number,
): ComponentDef {
  const od = odMm / 25.4; // catalog units are inches
  const len = 6;
  const size = `${odMm}mm`;
  return {
    id: slug(pn),
    partNumber: pn,
    brand: "Generic",
    family: "plastic",
    shape: "stub",
    description: `${material} pipe, d${odMm} mm, fusion ends`,
    material,
    sizeLabel: `d${odMm} mm`,
    dims: { len, dia: od, wall: od * 0.09 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "fuse", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "fuse", size),
    ],
    stretchable: true,
    stdLen: 6,
    finish,
  };
}

function plasticElbow(
  pn: string,
  material: string,
  finish: "plastic" | "hdpe",
  odMm: number,
): ComponentDef {
  const od = odMm / 25.4;
  const leg = 3 * od + 0.25;
  const size = `${odMm}mm`;
  return {
    id: slug(pn),
    partNumber: pn,
    brand: "Generic",
    family: "plastic",
    shape: "elbow",
    description: `${material} elbow 90 deg, d${odMm} mm, socket fusion`,
    material,
    sizeLabel: `d${odMm} mm`,
    dims: { leg, bodyDia: od * 1.25, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [leg, 0, 0], [1, 0, 0], "fuse", size),
      port("p2", [0, leg, 0], [0, 1, 0], "fuse", size),
    ],
    finish,
  };
}

function plasticTee(
  pn: string,
  material: string,
  finish: "plastic" | "hdpe",
  odMm: number,
): ComponentDef {
  const od = odMm / 25.4;
  const leg = 3 * od + 0.25;
  const size = `${odMm}mm`;
  return {
    id: slug(pn),
    partNumber: pn,
    brand: "Generic",
    family: "plastic",
    shape: "tee",
    description: `${material} tee, d${odMm} mm, socket fusion`,
    material,
    sizeLabel: `d${odMm} mm`,
    dims: { leg, bodyDia: od * 1.25, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [-leg, 0, 0], [-1, 0, 0], "fuse", size),
      port("p2", [leg, 0, 0], [1, 0, 0], "fuse", size),
      port("p3", [0, leg, 0], [0, 1, 0], "fuse", size),
    ],
    finish,
  };
}

function plasticValve(pn: string, odMm: number): ComponentDef {
  const t = odMm / 25.4;
  const size = `${odMm}mm`;
  const bodyW = 1.6;
  const portX = bodyW / 2 + 0.4;
  return {
    id: slug(pn),
    partNumber: pn,
    brand: "Generic",
    family: "plastic",
    shape: "ball-valve",
    description: `PP-H true-union ball valve, d${odMm} mm, socket fusion ends`,
    material: "PP-H",
    sizeLabel: `d${odMm} mm`,
    dims: {
      portX,
      bodyW,
      bodyH: 1.0,
      bodyD: 0.95,
      tubeDia: 1.6 * t + 0.12,
      nutDia: 2.1 * t + 0.12,
      nutLen: 0.25,
      stemDia: 0.22,
      handleLen: 1.5,
    },
    ports: [
      port("p1", [-portX, 0, 0], [-1, 0, 0], "fuse", size),
      port("p2", [portX, 0, 0], [1, 0, 0], "fuse", size),
    ],
    finish: "plastic",
  };
}

function flangeAdapter(pn: string, material: string, odMm: number): ComponentDef {
  const od = odMm / 25.4;
  const len = 2.2 * od + 0.6;
  const size = `${odMm}mm`;
  return {
    id: slug(pn),
    partNumber: pn,
    brand: "Generic",
    family: "plastic",
    shape: "sleeve",
    description: `${material} flange adapter (stub end), d${odMm} mm, fusion x flanged`,
    material,
    sizeLabel: `d${odMm} mm`,
    dims: { len, dia: od, bandDia: od * 1.9 + 0.15, bandLen: 0.18 },
    ports: [
      port("p1", [-len / 2, 0, 0], [-1, 0, 0], "fuse", size),
      port("p2", [len / 2, 0, 0], [1, 0, 0], "flange", size),
    ],
    finish: "plastic",
  };
}

// --- catalog ----------------------------------------------------------------

export const CATALOG: ComponentDef[] = [
  // -- Swagelok-style tube compression fittings (316 SS) --
  tubeUnion("SS-400-6", "Swagelok", "1/4", 0.25),
  tubeUnion("SS-600-6", "Swagelok", "3/8", 0.375),
  tubeUnion("SS-810-6", "Swagelok", "1/2", 0.5),
  tubeElbow("SS-400-9", "Swagelok", "1/4", 0.25),
  tubeElbow("SS-600-9", "Swagelok", "3/8", 0.375),
  tubeElbow("SS-810-9", "Swagelok", "1/2", 0.5),
  tubeTee("SS-400-3", "Swagelok", "1/4", 0.25),
  tubeTee("SS-600-3", "Swagelok", "3/8", 0.375),
  tubeTee("SS-810-3", "Swagelok", "1/2", 0.5),
  maleConnector("SS-400-1-4", "Swagelok", "1/4", 0.25, "1/4"),
  maleConnector("SS-600-1-4", "Swagelok", "3/8", 0.375, "1/4"),
  maleConnector("SS-810-1-8", "Swagelok", "1/2", 0.5, "1/2"),
  femaleConnector("SS-400-7-4", "Swagelok", "1/4", 0.25, "1/4"),
  reducingUnion("SS-600-6-4", "Swagelok", "3/8", 0.375, "1/4", 0.25),
  reducingUnion("SS-810-6-4", "Swagelok", "1/2", 0.5, "1/4", 0.25),
  tubeTerminator("SS-400-C", "Swagelok", "1/4", 0.25, "Cap"),
  tubeTerminator("SS-400-P", "Swagelok", "1/4", 0.25, "Plug"),

  // -- Uni-Lok equivalents (1/4 in) --
  tubeUnion("UU-04", "Uni-Lok", "1/4", 0.25),
  tubeElbow("UL-04", "Uni-Lok", "1/4", 0.25),
  tubeTee("UT-04", "Uni-Lok", "1/4", 0.25),
  maleConnector("UMC-04-4N", "Uni-Lok", "1/4", 0.25, "1/4"),

  // -- Vigor equivalents (3/8 in) + valve --
  tubeUnion("VG-U-06", "Vigor", "3/8", 0.375),
  tubeElbow("VG-E-06", "Vigor", "3/8", 0.375),
  tubeTee("VG-T-06", "Vigor", "3/8", 0.375),
  ballValve("VBV-04", "Vigor", "1/4", 0.25),

  // -- NPT pipe fittings (generic 316 SS) --
  hexNipple("GN-4N", "1/4", 1.45),
  hexNipple("GN-8N", "1/2", 1.85),
  nptElbow("GE-4N", "1/4"),
  streetElbow("GSE-4N", "1/4"),
  nptTee("GT-4N", "1/4"),
  coupling("GC-4N", "1/4"),
  hexBushing("GB-8N-4N", "1/2", "1/4"),
  pipePlug("GP-4N", "1/4"),
  pipeCap("GCA-4N", "1/4"),

  // -- Valves --
  ballValve("SS-43S4", "Swagelok", "1/4", 0.25),
  ballValve("SS-43S8", "Swagelok", "1/2", 0.5, true),
  needleValve("SS-1VS4", "Swagelok", "1/4", 0.25),

  // -- Instruments --
  {
    id: "pf-reg-4n",
    partNumber: "PF-REG-4N",
    brand: "Generic",
    family: "instrument",
    shape: "regulator",
    description: "Pressure regulator, 0-60 psig, 1/4 in FNPT in/out",
    material: MATERIAL,
    sizeLabel: "1/4 in NPT",
    dims: {
      bodyDia: 1.5,
      bodyH: 1.0,
      bonnetDia: 0.9,
      bonnetH: 0.5,
      knobDia: 1.1,
      knobH: 0.55,
      portX: 1.15,
      portDia: 0.5,
    },
    ports: [
      port("p1", [-1.15, 0, 0], [-1, 0, 0], "npt-f", "1/4"),
      port("p2", [1.15, 0, 0], [1, 0, 0], "npt-f", "1/4"),
    ],
  },
  {
    id: "pf-g25-100",
    partNumber: "PF-G25-100",
    brand: "Generic",
    family: "instrument",
    shape: "gauge",
    description: "Pressure gauge, 2 in dial, 0-100 psig, 1/4 in MNPT lower mount",
    material: MATERIAL,
    sizeLabel: "1/4 in NPT",
    dims: { caseDia: 2.0, caseDepth: 0.9, stemLen: 0.6, stemDia: 0.3 },
    ports: [port("p1", [0, 0, 0], [0, -1, 0], "npt-m", "1/4")],
  },

  // -- UHP: VCR-style face-seal + orbital weld --
  {
    id: "ss-4-vcr-g",
    partNumber: "SS-4-VCR-G",
    brand: "Swagelok",
    family: "uhp",
    shape: "gland",
    description: "Face-seal gland, 1/4 in VCR x tube butt weld",
    material: MATERIAL,
    sizeLabel: "1/4 in VCR",
    dims: { len: 1.1, dia: 0.25, ringDia: 0.42, ringLen: 0.09 },
    ports: [
      port("p1", [-0.55, 0, 0], [-1, 0, 0], "weld", "1/4"),
      port("p2", [0.55, 0, 0], [1, 0, 0], "fs-m", "1/4"),
    ],
  },
  {
    id: "ss-4-vcr-b",
    partNumber: "SS-4-VCR-B",
    brand: "Swagelok",
    family: "uhp",
    shape: "fconnector",
    description: "Face-seal body, 1/4 in female VCR x 1/4 in tube adapter",
    material: MATERIAL,
    sizeLabel: "1/4 in VCR",
    dims: { len: 1.5, nutDia: 0.62, nutLen: 0.35, hexDia: 0.75 },
    ports: [
      port("p1", [-0.75, 0, 0], [-1, 0, 0], "tube-comp", "1/4"),
      port("p2", [0.75, 0, 0], [1, 0, 0], "fs-f", "1/4"),
    ],
  },
  {
    id: "ss-4-vcr-u",
    partNumber: "SS-4-VCR-U",
    brand: "Swagelok",
    family: "uhp",
    shape: "nipple",
    description: "Face-seal union body, 1/4 in female VCR both ends",
    material: MATERIAL,
    sizeLabel: "1/4 in VCR",
    dims: { len: 1.6, hexDia: 0.75, threadDia: 0.4, threadLen: 0 },
    ports: [
      port("p1", [-0.8, 0, 0], [-1, 0, 0], "fs-f", "1/4"),
      port("p2", [0.8, 0, 0], [1, 0, 0], "fs-f", "1/4"),
    ],
  },
  {
    id: "ss-4-vcr-c",
    partNumber: "SS-4-VCR-C",
    brand: "Swagelok",
    family: "uhp",
    shape: "cap",
    description: "Face-seal cap, 1/4 in female VCR",
    material: MATERIAL,
    sizeLabel: "1/4 in VCR",
    dims: { len: 0.6, nutDia: 0.75, nutLen: 0.34 },
    ports: [port("p1", [-0.3, 0, 0], [-1, 0, 0], "fs-f", "1/4")],
  },
  {
    id: "uw-stb-04",
    partNumber: "UW-STB-04",
    brand: "Generic",
    family: "uhp",
    shape: "stub",
    description: "Weld stub, 1/4 in tube butt weld",
    material: MATERIAL,
    sizeLabel: "1/4 in weld",
    dims: { len: 1.0, dia: 0.25 },
    ports: [
      port("p1", [-0.5, 0, 0], [-1, 0, 0], "weld", "1/4"),
      port("p2", [0.5, 0, 0], [1, 0, 0], "weld", "1/4"),
    ],
  },
  {
    id: "uw-el-04",
    partNumber: "UW-EL-04",
    brand: "Generic",
    family: "uhp",
    shape: "elbow",
    description: "Orbital weld elbow 90 deg, 1/4 in tube",
    material: MATERIAL,
    sizeLabel: "1/4 in weld",
    dims: { leg: 0.75, bodyDia: 0.25, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [0.75, 0, 0], [1, 0, 0], "weld", "1/4"),
      port("p2", [0, 0.75, 0], [0, 1, 0], "weld", "1/4"),
    ],
  },
  {
    id: "uw-te-04",
    partNumber: "UW-TE-04",
    brand: "Generic",
    family: "uhp",
    shape: "tee",
    description: "Orbital weld tee, 1/4 in tube",
    material: MATERIAL,
    sizeLabel: "1/4 in weld",
    dims: { leg: 0.75, bodyDia: 0.25, nutDia: 0, nutLen: 0 },
    ports: [
      port("p1", [-0.75, 0, 0], [-1, 0, 0], "weld", "1/4"),
      port("p2", [0.75, 0, 0], [1, 0, 0], "weld", "1/4"),
      port("p3", [0, 0.75, 0], [0, 1, 0], "weld", "1/4"),
    ],
  },

  // -- Dockweiler ultron grade (UHP electropolished, VIM-VAR 1.4435) --
  dwTube(1001, "ULTRON", "1/4", 0.25, "0.035"),
  dwTube(1002, "ULTRON", "1/2", 0.5, "0.049"),
  dwTube(1003, "ULTRON", "6mm", 0.236, "1.0"),
  dwTube(1004, "ULTRON", "12mm", 0.472, "1.5"),
  dwWeldElbow(1101, "ULTRON", "1/4", 0.25, "0.035"),
  dwWeldElbow(1102, "ULTRON", "1/2", 0.5, "0.049"),
  dwWeldElbow(1103, "ULTRON", "6mm", 0.236, "1.0"),
  dwWeldTee(1201, "ULTRON", "1/4", 0.25, "0.035"),
  dwWeldTee(1202, "ULTRON", "1/2", 0.5, "0.049"),
  dwWeldReducer(1301, "ULTRON", "1/2", 0.5, "1/4", 0.25, "0.049"),
  dwWeldUnion(1401, "ULTRON", "1/4", 0.25, "0.035"),

  // -- Dockweiler TCC grade (bright annealed, technical gas) --
  dwTube(2001, "TCC", "1/4", 0.25, "0.035"),
  dwTube(2002, "TCC", "1/2", 0.5, "0.049"),
  dwWeldUnion(2401, "TCC", "1/4", 0.25, "0.035"),

  // -- GCE Druva specialty-gas regulators --
  gceRegulator("FMD 500-14", "Cylinder pressure regulator, 230 bar in / 0-14 bar out", "1/4", "npt-f", "tube-comp"),
  gceRegulator("LMD 545-25", "Line regulator, 0-25 bar", "1/4", "tube-comp", "tube-comp"),
  gceRegulator("EMD 300-06", "Point-of-use regulator, 0-6 bar", "1/4", "fs-m", "fs-m"),
  gceRegulator("D1G", "Dome-loaded high-flow regulator", "1/2", "npt-f", "npt-f", 1.6),
  diaphragmValve("MVA 500 G", "GCE Druva", "1/4"),

  // -- POU stick hardware (generic UHP) --
  diaphragmValve("UHP-DV-4", "Generic", "1/4"),
  uprightDevice("GP-RV-4N", "Relief valve, 1/4 in MNPT inlet", "1/4 in NPT", "npt-m", "1/4", { stemDia: 0.3, stemLen: 0.3, bodyDia: 0.7, bodyH: 1.0 }),
  checkValve("GP-CV-4", "1/4", 0.25),
  uprightDevice("GP-PT-4", "Pressure transducer, 1/4 in face-seal male", "1/4 in VCR", "fs-m", "1/4", { stemDia: 0.25, stemLen: 0.25, bodyDia: 0.55, bodyH: 0.9 }),

  // -- PP-H system (socket fusion) --
  plasticPipe("PPH-PIPE-d25", "PP-H", "plastic", 25),
  plasticPipe("PPH-PIPE-d50", "PP-H", "plastic", 50),
  plasticElbow("PPH-EL90-d25", "PP-H", "plastic", 25),
  plasticElbow("PPH-EL90-d50", "PP-H", "plastic", 50),
  plasticTee("PPH-TEE-d25", "PP-H", "plastic", 25),
  plasticTee("PPH-TEE-d50", "PP-H", "plastic", 50),
  plasticValve("PPH-BV-d25", 25),
  flangeAdapter("PPH-FLG-d25", "PP-H", 25),
  flangeAdapter("PPH-FLG-d50", "PP-H", 50),

  // -- HDPE system (butt/socket fusion, PE100) --
  plasticPipe("HDPE-PIPE-d32", "HDPE (PE100)", "hdpe", 32),
  plasticPipe("HDPE-PIPE-d63", "HDPE (PE100)", "hdpe", 63),
  plasticElbow("HDPE-EL90-d32", "HDPE (PE100)", "hdpe", 32),
  plasticTee("HDPE-TEE-d63", "HDPE (PE100)", "hdpe", 63),
  flangeAdapter("HDPE-FLG-d63", "HDPE (PE100)", 63),

  // -- Pipe supports (placed and listed, never connected) --
  {
    id: "sup-strut-1m",
    partNumber: "SUP-STRUT-1M",
    brand: "Generic",
    family: "support",
    shape: "block",
    description: "Strut channel 41x41 mm, 1 m mounting rail",
    material: "HDG steel",
    sizeLabel: "1 m",
    dims: { blockW: 6, blockH: 0.35, blockD: 0.35, stubLen: 0, stubDia: 0 },
    ports: [],
  },
  {
    id: "sup-clp-25",
    partNumber: "SUP-CLP-25",
    brand: "Generic",
    family: "support",
    shape: "sleeve",
    description: "Pipe clamp with EPDM lining, up to 25 mm / 1 in OD",
    material: "HDG steel",
    sizeLabel: "25 mm",
    dims: { len: 0.5, dia: 1.1, bandDia: 1.35, bandLen: 0.5 },
    ports: [],
  },
  {
    id: "sup-hng-25",
    partNumber: "SUP-HNG-25",
    brand: "Generic",
    family: "support",
    shape: "upright",
    description: "Clevis hanger, up to 25 mm / 1 in pipe",
    material: "HDG steel",
    sizeLabel: "25 mm",
    dims: { stemDia: 0.12, stemLen: 1.2, bodyDia: 0.9, bodyH: 0.8 },
    ports: [],
  },
];

const byId = new Map(CATALOG.map((d) => [d.id, d]));

// User-defined custom parts, registered at runtime (persisted by the store).
const customDefs: ComponentDef[] = [];

export function registerCustomDef(def: ComponentDef): void {
  if (byId.has(def.id)) return;
  customDefs.push(def);
  byId.set(def.id, def);
}

export function allDefs(): ComponentDef[] {
  return [...CATALOG, ...customDefs];
}

export function getDef(id: string): ComponentDef | undefined {
  return byId.get(id);
}

// Ports with a length override applied (stretchable tubes: ports move out to
// +/- len/2 on X). Returns def.ports unchanged for anything else.
export function effPorts(def: ComponentDef, lengthOverride?: number): PortDef[] {
  if (!def.stretchable || lengthOverride == null) return def.ports;
  const half = lengthOverride / 2;
  return def.ports.map((p) =>
    p.position[0] !== 0
      ? {
          ...p,
          position: [
            Math.sign(p.position[0]) * half,
            p.position[1],
            p.position[2],
          ] as Vec3,
        }
      : p,
  );
}

export const BRANDS: Brand[] = [
  "Swagelok",
  "Uni-Lok",
  "Vigor",
  "Dockweiler",
  "GCE Druva",
  "Generic",
];

export const SIZES = [
  "1/4",
  "3/8",
  "1/2",
  "6mm",
  "8mm",
  "10mm",
  "12mm",
  "20mm",
  "25mm",
  "32mm",
  "40mm",
  "50mm",
  "63mm",
];

export const FAMILIES: { value: ComponentDef["family"]; label: string }[] = [
  { value: "tube", label: "Tube fittings" },
  { value: "npt", label: "NPT pipe fittings" },
  { value: "valve", label: "Valves" },
  { value: "regulator", label: "Gas regulators (GCE Druva)" },
  { value: "instrument", label: "Gauges & instruments" },
  { value: "uhp", label: "UHP face-seal & weld" },
  { value: "uhp-tube", label: "UHP tube & weld (Dockweiler)" },
  { value: "plastic", label: "Plastic systems (PP-H / HDPE)" },
  { value: "support", label: "Pipe supports" },
];

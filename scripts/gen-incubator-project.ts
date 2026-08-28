// Generator: CO2 incubator gas supply — 4-cylinder (2x2) auto-changeover
// manifold feeding a welded 1/2 in UHP main with 4 points of use.
//
// Builds the scene with the app's OWN catalog + run builder, so every part,
// port and connection is exactly what PipeForge would place interactively.
// Output: a v2 project file (File > Open in PipeForge).
//
// Build & run (from the repo root):
//   npx tsc scripts/gen-incubator-project.ts --outDir scripts/.gen-out \
//     --rootDir . --module commonjs --target es2022 --skipLibCheck
//   node scripts/.gen-out/scripts/gen-incubator-project.js <output.json>
import * as THREE from "three";
import { writeFileSync } from "fs";
import { allDefs, effPorts, getDef, registerCustomDef } from "../lib/catalog";
import { portsCompatible } from "../lib/compat";
import { buildRunParts } from "../lib/run";
import type { ComponentDef, PlacedComponent, PortDef, Quat, Vec3 } from "../lib/types";

// --- layout constants (scene inches, Y is up) -------------------------------
const MANIFOLD_Y = 56; // manifold centerline ~1.42 m above floor
const POU_Y = 41; // POU stick centerline ~1.04 m (incubator inlet height)
const CYL_VALVE_Y = 50; // cylinder valve outlet height
const MAIN_Z = 6; // main line standoff from the wall plane (z=0)
const TEE_XS = [8, 16, 24, 32]; // the four POU branch positions along +X

// --- custom catalog part: 4-cylinder changeover (2 cylinders per bank) ------
// Same pattern as the seed "BMD 500-14 2X1" block, but with two 1/4 in FNPT
// pigtail inlets per side. Travels inside the project file (customDefs), so
// it loads on any machine.
const BMD_2X2: ComponentDef = {
  id: "bmd-500-14-2x2",
  partNumber: "BMD 500-14 2X2",
  brand: "GCE Druva",
  family: "regulator",
  shape: "block",
  description:
    "4-cylinder auto-changeover manifold, 2x2 (semi-automatic), 230 bar in / 0-14 bar out, with purge/vent port",
  material: "316 SS",
  sizeLabel: "2x2 cylinder, 1/2 in out",
  dims: { blockW: 8, blockH: 2.5, blockD: 2, stubLen: 0.6, stubDia: 0.5 },
  ports: [
    { id: "p1", position: [-4, 0, -0.6], direction: [-1, 0, 0], endType: "npt-f", size: "1/4" }, // bank A cyl 1 pigtail
    { id: "p2", position: [-4, 0, 0.6], direction: [-1, 0, 0], endType: "npt-f", size: "1/4" }, // bank A cyl 2 pigtail
    { id: "p3", position: [4, 0, -0.6], direction: [1, 0, 0], endType: "npt-f", size: "1/4" }, // bank B cyl 1 pigtail
    { id: "p4", position: [4, 0, 0.6], direction: [1, 0, 0], endType: "npt-f", size: "1/4" }, // bank B cyl 2 pigtail
    { id: "p5", position: [0, 0, 1], direction: [0, 0, 1], endType: "tube-comp", size: "1/2" }, // process outlet to main
    { id: "p6", position: [0, 0, -1], direction: [0, 0, -1], endType: "npt-f", size: "1/4" }, // purge / vent
  ],
};
registerCustomDef(BMD_2X2);

// --- small placement framework (mirrors lib/assembly.ts semantics) ----------
let uidN = 0;
const mkUid = () => `pf-inc-${++uidN}`;
const IDENTITY: Quat = [0, 0, 0, 1];
const placed: PlacedComponent[] = [];
const byUid = new Map<string, PlacedComponent>();

const defByPn = (pn: string): ComponentDef => {
  const d = allDefs().find((x) => x.partNumber === pn);
  if (!d) throw new Error(`catalog part missing: ${pn}`);
  return d;
};
const TUBE_H = defByPn("DW-1002-1/2x0.049-1.4435-ULTRON"); // 1/2 in UHP tube
const ELBOW_H = defByPn("DW-1102-1/2x0.049-1.4435-ULTRON"); // 1/2 in weld elbow
const TEE_H = defByPn("DW-1202-1/2x0.049-1.4435-ULTRON"); // 1/2 in weld tee
const REDUCER = defByPn("DW-1301-1/2x1/4x0.049-1.4435-ULTRON"); // 1/2 -> 1/4 weld
const TUBE_Q = defByPn("DW-1001-1/4x0.035-1.4435-ULTRON"); // 1/4 in UHP tube
const ELBOW_Q = defByPn("DW-1101-1/4x0.035-1.4435-ULTRON"); // 1/4 in weld elbow
const LEG_H = ELBOW_H.dims.leg; // 1.75
const LEG_Q = ELBOW_Q.dims.leg; // 1.0

function add(p: PlacedComponent): PlacedComponent {
  placed.push(p);
  byUid.set(p.uid, p);
  return p;
}
function link(a: PlacedComponent, aPort: string, b: PlacedComponent, bPort: string): void {
  a.connections.push({ portId: aPort, otherUid: b.uid, otherPortId: bPort });
  b.connections.push({ portId: bPort, otherUid: a.uid, otherPortId: aPort });
}
function portWorld(p: PlacedComponent, portId: string): { pos: THREE.Vector3; dir: THREE.Vector3; port: PortDef } {
  const def = getDef(p.defId)!;
  const port = effPorts(def, p.lengthOverride).find((x) => x.id === portId);
  if (!port) throw new Error(`${def.partNumber} has no port ${portId}`);
  const q = new THREE.Quaternion(...p.quaternion);
  return {
    port,
    pos: new THREE.Vector3(...port.position).applyQuaternion(q).add(new THREE.Vector3(...p.position)),
    dir: new THREE.Vector3(...port.direction).applyQuaternion(q).normalize(),
  };
}
function placeExplicit(def: ComponentDef, position: Vec3, quaternion: Quat): PlacedComponent {
  return add({ uid: mkUid(), defId: def.id, position, quaternion, connections: [] });
}
// Snap `def` onto a target port (first compatible port), like placePart with an
// active port. Returns the new part.
function snapOnto(target: PlacedComponent, tPortId: string, def: ComponentDef): PlacedComponent {
  const t = portWorld(target, tPortId);
  const cPort = def.ports.find((p) => portsCompatible(t.port, p));
  if (!cPort) throw new Error(`${def.partNumber} cannot join ${getDef(target.defId)!.partNumber} ${tPortId}`);
  const qB = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(...cPort.direction).normalize(),
    t.dir.clone().negate(),
  );
  const pB = t.pos.clone().sub(new THREE.Vector3(...cPort.position).applyQuaternion(qB));
  const np = add({
    uid: mkUid(),
    defId: def.id,
    position: [pB.x, pB.y, pB.z],
    quaternion: [qB.x, qB.y, qB.z, qB.w],
    connections: [],
  });
  link(np, cPort.id, target, tPortId);
  return np;
}
// Straight stretchable tube with p1 exactly at `a` and p2 exactly at `b`.
function tubeBetween(a: THREE.Vector3, b: THREE.Vector3, tubeDef: ComponentDef): PlacedComponent {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const mid = a.clone().addScaledVector(dir, len / 2);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  return add({
    uid: mkUid(),
    defId: tubeDef.id,
    position: [mid.x, mid.y, mid.z],
    quaternion: [q.x, q.y, q.z, q.w],
    connections: [],
    lengthOverride: Math.min(36, Math.max(1, len)),
  });
}
// 90 deg elbow at a corner (same basis math as buildRunParts).
function elbowAt(corner: Vec3, dIn: Vec3, dOut: Vec3, elbowDef: ComponentDef): PlacedComponent {
  const dI = new THREE.Vector3(...dIn).normalize();
  const dO = new THREE.Vector3(...dOut).normalize();
  const e1 = dI.clone().negate();
  const e3 = new THREE.Vector3().crossVectors(e1, dO).normalize();
  const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
  const qe = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3));
  return add({ uid: mkUid(), defId: elbowDef.id, position: corner, quaternion: [qe.x, qe.y, qe.z, qe.w], connections: [] });
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- build: manifold ---------------------------------------------------------
const man = placeExplicit(BMD_2X2, [0, MANIFOLD_Y, 0], IDENTITY);

// --- build: 4 cylinder pigtails ---------------------------------------------
// nipple -> female connector -> check valve -> transition union -> 1/4 in weld
// pigtail out to the side and down to cylinder-valve height (open cylinder end).
const GN4N = defByPn("GN-4N");
const FC = defByPn("SS-400-7-4");
const CV = defByPn("GP-CV-4");
const TSW4 = defByPn("SS-4-TSW-6");
for (const inlet of ["p1", "p2", "p3", "p4"]) {
  const nip = snapOnto(man, inlet, GN4N);
  const fc = snapOnto(nip, "p2", FC); // joins via its npt-f port; tube-comp p1 free
  const cv = snapOnto(fc, "p1", CV);
  const tu = snapOnto(cv, "p2", TSW4); // joins via tube-comp; weld p1 free
  const w = portWorld(tu, "p1");
  const sx = w.dir.x >= 0 ? 1 : -1;
  const pts: Vec3[] = [
    [w.pos.x, w.pos.y, w.pos.z],
    [w.pos.x + sx * 3, w.pos.y, w.pos.z],
    [w.pos.x + sx * 3, CYL_VALVE_Y, w.pos.z],
  ];
  const parts = buildRunParts(pts, TUBE_Q, ELBOW_Q, mkUid);
  if (parts.length === 0) throw new Error("pigtail run placed nothing");
  parts.forEach(add);
  link(tu, "p1", parts[0], "p1");
}

// --- build: purge / vent -> alarm box ----------------------------------------
// nipple out of the back port, elbow down, nipple, alarm box hanging below.
const GE4N = defByPn("GE-4N");
const ALARM = defByPn("GCE-ALM-1");
{
  const nipA = snapOnto(man, "p6", GN4N);
  const nipAw = portWorld(nipA, "p2"); // faces -Z
  // Elbow: local p1 (+X) -> +Z (toward the nipple), local p2 (+Y) -> down.
  const e1 = v(0, 0, 1);
  const e2 = v(0, -1, 0);
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  const qe = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(e1, e2, e3));
  const leg = GE4N.dims.leg; // 0.9
  const elbC = nipAw.pos.clone().addScaledVector(v(0, 0, 1), -leg); // corner center
  const elb = placeExplicit(GE4N, [elbC.x, elbC.y, elbC.z], [qe.x, qe.y, qe.z, qe.w]);
  link(nipA, "p2", elb, "p1");
  const elbP2 = portWorld(elb, "p2"); // faces down
  // Vertical nipple: local +X -> -Y, so p1 (male) points up into the elbow.
  const qV = new THREE.Quaternion().setFromUnitVectors(v(1, 0, 0), v(0, -1, 0));
  const nipLen = GN4N.dims.len;
  const nipBc = elbP2.pos.clone().add(v(0, -nipLen / 2, 0));
  const nipB = placeExplicit(GN4N, [nipBc.x, nipBc.y, nipBc.z], [qV.x, qV.y, qV.z, qV.w]);
  link(elb, "p2", nipB, "p1");
  // Alarm box rotated 180 deg about Z: its p1 (bottom, npt-f) faces up.
  const nipBw = portWorld(nipB, "p2");
  const qA = new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), Math.PI);
  const almC = nipBw.pos.clone().add(v(0, -2, 0)); // after the 180 deg Z flip, box p1 sits 2 in above center
  const alm = placeExplicit(ALARM, [almC.x, almC.y, almC.z], [qA.x, qA.y, qA.z, qA.w]);
  link(nipB, "p2", alm, "p1");
}

// --- build: 1/2 in main with 4 branches --------------------------------------
const TSW8 = defByPn("SS-8-TSW-6");
const tsw8 = snapOnto(man, "p5", TSW8); // compression outlet -> weld main
const tsw8w = portWorld(tsw8, "p1"); // weld end, faces +Z

const t1 = tubeBetween(tsw8w.pos, v(0, MANIFOLD_Y, MAIN_Z - LEG_H), TUBE_H);
link(tsw8, "p1", t1, "p1");
const eMain = elbowAt([0, MANIFOLD_Y, MAIN_Z], [0, 0, 1], [1, 0, 0], ELBOW_H);
link(t1, "p2", eMain, "p1");

// --- one POU drop per branch tee ---------------------------------------------
// 1/2 in drop -> reducer -> 1/4 in drop -> elbow toward +Z -> VCR stick:
// gland -> union -> diaphragm valve -> union -> POU regulator -> 1/4 in
// compression outlet (incubator hose connection).
const GLAND = defByPn("SS-4-VCR-G");
const VCR_U = defByPn("SS-4-VCR-U");
const DV = defByPn("UHP-DV-4");
const EMD = defByPn("EMD 300-06");
const VCR_B = defByPn("SS-4-VCR-B");
function buildPou(tee: PlacedComponent): void {
  const p3 = portWorld(tee, "p3"); // faces down
  const x = p3.pos.x;
  const drop = tubeBetween(p3.pos, v(x, POU_Y + LEG_Q + 3.425 + REDUCER.dims.len, MAIN_Z), TUBE_H);
  link(tee, "p3", drop, "p1");
  const red = snapOnto(drop, "p2", REDUCER);
  const redW = portWorld(red, "p2"); // 1/4 in weld, faces down
  const tq = tubeBetween(redW.pos, v(x, POU_Y + LEG_Q, MAIN_Z), TUBE_Q);
  link(red, "p2", tq, "p1");
  const elb = elbowAt([x, POU_Y, MAIN_Z], [0, -1, 0], [0, 0, 1], ELBOW_Q);
  link(tq, "p2", elb, "p1");
  const tq2 = tubeBetween(v(x, POU_Y, MAIN_Z + LEG_Q), v(x, POU_Y, MAIN_Z + LEG_Q + 2.5), TUBE_Q);
  link(elb, "p2", tq2, "p1");
  let tailPart = tq2;
  let tailPort = "p2";
  for (const def of [GLAND, VCR_U, DV, VCR_U, EMD, VCR_B]) {
    const np = snapOnto(tailPart, tailPort, def);
    const usedPort = np.connections[0].portId;
    const free = getDef(np.defId)!.ports.find((p) => p.id !== usedPort);
    if (!free) throw new Error(`${def.partNumber}: no free port after snap`);
    tailPart = np;
    tailPort = free.id;
  }
}

let prevPart: PlacedComponent = eMain;
let prevEnd = v(LEG_H, MANIFOLD_Y, MAIN_Z);
for (const tx of TEE_XS) {
  const tee = placeExplicit(TEE_H, [tx, MANIFOLD_Y, MAIN_Z], [1, 0, 0, 0]); // 180 deg about X: branch p3 points down
  const seg = tubeBetween(prevEnd, v(tx - LEG_H, MANIFOLD_Y, MAIN_Z), TUBE_H);
  link(prevPart, "p2", seg, "p1");
  link(seg, "p2", tee, "p1");
  buildPou(tee);
  prevPart = tee;
  prevEnd = v(tx + LEG_H, MANIFOLD_Y, MAIN_Z);
}
// Future-expansion tail stub past the last tee.
const tail = tubeBetween(prevEnd, v(38, MANIFOLD_Y, MAIN_Z), TUBE_H);
link(prevPart, "p2", tail, "p1");

// --- supports (never connected, listed in the MTO) ---------------------------
placeExplicit(defByPn("SUP-STRUT-1M"), [16, MANIFOLD_Y - 0.7, MAIN_Z + 0.6], IDENTITY);
for (const cx of [12, 20, 28]) placeExplicit(defByPn("SUP-CLP-25"), [cx, MANIFOLD_Y, MAIN_Z], IDENTITY);

// --- validate every joint, then write ----------------------------------------
let errors = 0;
const fail = (msg: string) => {
  errors += 1;
  console.error(`  INVALID: ${msg}`);
};
for (const p of placed) {
  if (!getDef(p.defId)) fail(`${p.uid}: unknown defId ${p.defId}`);
  for (const c of p.connections) {
    const other = byUid.get(c.otherUid);
    if (!other) {
      fail(`${p.uid} ${c.portId}: missing peer ${c.otherUid}`);
      continue;
    }
    const recip = other.connections.find(
      (x) => x.otherUid === p.uid && x.portId === c.otherPortId && x.otherPortId === c.portId,
    );
    if (!recip) fail(`${p.uid} ${c.portId}: connection not reciprocal`);
    const a = portWorld(p, c.portId);
    const b = portWorld(other, c.otherPortId);
    if (a.pos.distanceTo(b.pos) > 1e-3)
      fail(`${getDef(p.defId)!.partNumber} ${c.portId} <-> ${getDef(other.defId)!.partNumber} ${c.otherPortId}: faces ${a.pos.distanceTo(b.pos).toFixed(4)} in apart`);
    if (a.dir.dot(b.dir) > -0.9999)
      fail(`${getDef(p.defId)!.partNumber} ${c.portId} <-> ${getDef(other.defId)!.partNumber} ${c.otherPortId}: axes not opposed`);
    if (!portsCompatible(a.port, b.port))
      fail(`${getDef(p.defId)!.partNumber} ${c.portId} <-> ${getDef(other.defId)!.partNumber} ${c.otherPortId}: incompatible ends`);
  }
}
if (errors > 0) {
  console.error(`\n${errors} invalid joint(s) — project NOT written.`);
  process.exit(1);
}

// MTO-style summary to stdout.
const counts = new Map<string, { qty: number; len: number }>();
for (const p of placed) {
  const def = getDef(p.defId)!;
  const e = counts.get(def.partNumber) ?? { qty: 0, len: 0 };
  e.qty += 1;
  if (def.stretchable) e.len += p.lengthOverride ?? def.dims.len;
  counts.set(def.partNumber, e);
}
console.log(`\n${placed.length} parts, all joints valid. Bill of material:`);
for (const [pn, e] of [...counts.entries()].sort()) {
  console.log(`  ${pn} x${e.qty}${e.len > 0 ? ` (${e.len.toFixed(1)} in total)` : ""}`);
}

const project = { app: "pipeforge", version: 2, placed, customDefs: [BMD_2X2] };
const out =
  process.argv[2] ?? "pipeforge-project-4cyl-incubator.json";
writeFileSync(out, JSON.stringify(project, null, 2));
console.log(`\nWrote ${out}`);

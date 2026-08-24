// Minimal IFC4 (STEP, ISO-10303-21) writer — no dependencies.
// Maps placed parts to IfcPipeSegment (straight tube/pipe runs) and
// IfcPipeFitting (everything else) with IfcFacetedBrep geometry, scoped to
// what PipeForge's object model actually represents — not full BIM-LOD.
//
// Units: scene inches are converted to metres. Axes: the scene is Y-up,
// IFC is Z-up, so (x, y, z) -> (x, -z, y) (right-handedness preserved).
import type { PartGeometry } from "./export3d";

const M_PER_IN = 0.0254;
const IFC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// IFC GlobalId: 128 bits in a 22-char base64 variant. Deterministic per seed
// so re-exports of the same assembly keep stable ids. (Constructor form —
// the project's ES2017 target disallows BigInt literal syntax.)
const MASK64 = BigInt("0xffffffffffffffff");
function ifcGuid(seed: string): string {
  let h1 = BigInt("0x9e3779b97f4a7c15");
  let h2 = BigInt("0xc2b2ae3d27d4eb4f");
  for (let i = 0; i < seed.length; i++) {
    const c = BigInt(seed.charCodeAt(i));
    h1 = ((h1 ^ c) * BigInt("0x100000001b3")) & MASK64;
    h2 = ((h2 << BigInt(7)) ^ (h1 + c + BigInt(i))) & MASK64;
  }
  const num = (h1 << BigInt(64)) | h2;
  let out = IFC_CHARS[Number((num >> BigInt(126)) & BigInt(3))];
  for (let i = 0; i < 21; i++) out += IFC_CHARS[Number((num >> BigInt(120 - i * 6)) & BigInt(63))];
  return out;
}

const f = (v: number): string => {
  const s = (v * M_PER_IN).toFixed(6).replace(/\.?0+$/, "") || "0";
  return s.includes(".") ? s : s + ".";
};

// Y-up inches -> Z-up metres.
const pt3 = (x: number, y: number, z: number): string => `(${f(x)},${f(-z)},${f(y)})`;

class Step {
  private entities: string[] = [];
  private next = 1;
  add(body: string): number {
    const id = this.next++;
    this.entities.push(`#${id}=${body};`);
    return id;
  }
  ref(id: number): string {
    return `#${id}`;
  }
  text(): string {
    return this.entities.join("\n");
  }
}

export function buildIfc(
  parts: PartGeometry[],
  kindOf: (uid: string) => "segment" | "fitting",
): string {
  const s = new Step();

  const person = s.add("IFCPERSON($,$,'PipeForge user',$,$,$,$,$)");
  const org = s.add("IFCORGANIZATION($,'PipeForge',$,$,$)");
  const po = s.add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`);
  const app = s.add(`IFCAPPLICATION(#${org},'0.1.0','PipeForge','PipeForge')`);
  const owner = s.add(`IFCOWNERHISTORY(#${po},#${app},$,.ADDED.,$,#${po},#${app},0)`);

  const origin = s.add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zDir = s.add("IFCDIRECTION((0.,0.,1.))");
  const xDir = s.add("IFCDIRECTION((1.,0.,0.))");
  const worldPlacement = s.add(`IFCAXIS2PLACEMENT3D(#${origin},#${zDir},#${xDir})`);
  const north = s.add("IFCDIRECTION((0.,1.))");
  const ctx = s.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${worldPlacement},#${north})`,
  );

  const lenU = s.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const areaU = s.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const volU = s.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const angU = s.add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = s.add(`IFCUNITASSIGNMENT((#${lenU},#${areaU},#${volU},#${angU}))`);

  const project = s.add(
    `IFCPROJECT('${ifcGuid("pipeforge-project")}',#${owner},'PipeForge assembly',$,$,$,$,(#${ctx}),#${units})`,
  );
  const site = s.add(
    `IFCSITE('${ifcGuid("pipeforge-site")}',#${owner},'Site',$,$,#${worldPlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  const building = s.add(
    `IFCBUILDING('${ifcGuid("pipeforge-building")}',#${owner},'Building',$,$,#${worldPlacement},$,$,.ELEMENT.,$,$,$)`,
  );
  const storey = s.add(
    `IFCBUILDINGSTOREY('${ifcGuid("pipeforge-storey")}',#${owner},'Level 0',$,$,#${worldPlacement},$,$,.ELEMENT.,0.)`,
  );
  s.add(
    `IFCRELAGGREGATES('${ifcGuid("agg1")}',#${owner},$,$,#${project},(#${site}))`,
  );
  s.add(`IFCRELAGGREGATES('${ifcGuid("agg2")}',#${owner},$,$,#${site},(#${building}))`);
  s.add(`IFCRELAGGREGATES('${ifcGuid("agg3")}',#${owner},$,$,#${building},(#${storey}))`);

  const productIds: number[] = [];

  for (const part of parts) {
    // Share cartesian points across the part's faces (cuts file size ~3x).
    const pointIds = new Map<string, number>();
    const pointId = (x: number, y: number, z: number): number => {
      const key = pt3(x, y, z);
      let id = pointIds.get(key);
      if (!id) {
        id = s.add(`IFCCARTESIANPOINT(${key})`);
        pointIds.set(key, id);
      }
      return id;
    };

    const faceIds: number[] = [];
    for (let o = 0; o + 8 < part.tris.length; o += 9) {
      const a = pointId(part.tris[o], part.tris[o + 1], part.tris[o + 2]);
      const b = pointId(part.tris[o + 3], part.tris[o + 4], part.tris[o + 5]);
      const c = pointId(part.tris[o + 6], part.tris[o + 7], part.tris[o + 8]);
      if (a === b || b === c || a === c) continue; // degenerate triangle
      const loop = s.add(`IFCPOLYLOOP((#${a},#${b},#${c}))`);
      const bound = s.add(`IFCFACEOUTERBOUND(#${loop},.T.)`);
      faceIds.push(s.add(`IFCFACE((#${bound}))`));
    }
    if (faceIds.length === 0) continue;

    const shell = s.add(`IFCCLOSEDSHELL((${faceIds.map((i) => `#${i}`).join(",")}))`);
    const brep = s.add(`IFCFACETEDBREP(#${shell})`);
    const shape = s.add(`IFCSHAPEREPRESENTATION(#${ctx},'Body','Brep',(#${brep}))`);
    const pds = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`);

    // Placement at the part centroid; identity axes (geometry is baked to
    // world coordinates, so the local frame only anchors the object).
    let cx = 0, cy = 0, cz = 0;
    const nPts = part.tris.length / 3;
    for (let i = 0; i < part.tris.length; i += 3) {
      cx += part.tris[i];
      cy += part.tris[i + 1];
      cz += part.tris[i + 2];
    }
    const cp = s.add(`IFCCARTESIANPOINT(${pt3(cx / nPts, cy / nPts, cz / nPts)})`);
    const axis = s.add(`IFCAXIS2PLACEMENT3D(#${cp},$,$)`);
    const placement = s.add(`IFCLOCALPLACEMENT($,#${axis})`);

    const cls = kindOf(part.uid) === "segment" ? "IFCPIPESEGMENT" : "IFCPIPEFITTING";
    const name = part.partNumber.replace(/'/g, "");
    productIds.push(
      s.add(`${cls}('${ifcGuid(`part-${part.uid}`)}',#${owner},'${name}',$,$,#${placement},#${pds},$,$)`),
    );
  }

  if (productIds.length > 0) {
    s.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid("contained")}',#${owner},$,$,(${productIds
        .map((i) => `#${i}`)
        .join(",")}),#${storey})`,
    );
  }

  const now = new Date().toISOString().slice(0, 19);
  return (
    "ISO-10303-21;\nHEADER;\n" +
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n" +
    `FILE_NAME('pipeforge.ifc','${now}',('PipeForge'),('PipeForge'),'PipeForge','PipeForge','');\n` +
    "FILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n" +
    s.text() +
    "\nENDSEC;\nEND-ISO-10303-21;\n"
  );
}

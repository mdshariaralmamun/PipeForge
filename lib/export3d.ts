// Shared geometry extraction for the CAD exporters (DXF, vector PDF, IFC).
// Triangles come straight from the live viewport scene — only meshes under a
// group tagged `userData.pfPart` (the part bodies in PartMesh), so markers,
// handles, grid, and gizmo never leak into exports.
import * as THREE from "three";
import { effPorts, getDef } from "./catalog";
import type { PlacedComponent } from "./types";

export interface PartGeometry {
  uid: string;
  partNumber: string;
  /** World-space triangles: 9 numbers per triangle (xyz per vertex). */
  tris: number[];
}

/** Collect world-space triangles per placed part from the live scene. */
export function collectPartGeometry(scene: THREE.Scene): PartGeometry[] {
  scene.updateMatrixWorld(true);
  const out = new Map<string, PartGeometry>();
  const v = new THREE.Vector3();

  scene.traverse((root) => {
    const uid = (root.userData as { pfPart?: string }).pfPart;
    if (!uid) return;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos) return;
      let part = out.get(uid);
      if (!part) {
        part = { uid, partNumber: uid, tris: [] };
        out.set(uid, part);
      }
      const push = (i: number) => {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        part!.tris.push(v.x, v.y, v.z);
      };
      const index = geo.getIndex();
      if (index) for (let i = 0; i < index.count; i++) push(index.getX(i));
      else for (let i = 0; i < pos.count; i++) push(i);
    });
  });
  return [...out.values()];
}

/** Fill in human part numbers from the assembly state (uid is the fallback). */
export function labelParts(geoms: PartGeometry[], placed: PlacedComponent[]): PartGeometry[] {
  const byUid = new Map(placed.map((p) => [p.uid, p.defId]));
  for (const g of geoms) {
    const defId = byUid.get(g.uid);
    const def = defId ? getDef(defId) : undefined;
    if (def) g.partNumber = def.partNumber;
  }
  return geoms;
}

export interface Centerline {
  partNumber: string;
  /** Segment endpoints, flattened: [x1,y1,z1, x2,y2,z2]. */
  seg: number[];
}

/**
 * One skeleton segment per port, from the part center to the port face —
 * elbows/tees get their bent star, straight parts a single through-line.
 */
export function collectCenterlines(placed: PlacedComponent[]): Centerline[] {
  const out: Centerline[] = [];
  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def) continue;
    const q = new THREE.Quaternion(...p.quaternion);
    const c = new THREE.Vector3(...p.position);
    const ports = effPorts(def, p.lengthOverride).map((port) =>
      new THREE.Vector3(...port.position).applyQuaternion(q).add(c),
    );
    const seg: number[] = [];
    if (ports.length === 2) {
      seg.push(ports[0].x, ports[0].y, ports[0].z, ports[1].x, ports[1].y, ports[1].z);
    } else {
      for (const w of ports) seg.push(c.x, c.y, c.z, w.x, w.y, w.z);
    }
    out.push({ partNumber: def.partNumber, seg });
  }
  return out;
}

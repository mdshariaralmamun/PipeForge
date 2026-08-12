// Weld joint computation for the placed assembly:
// (a) weld-to-weld connections (orbital weld joints)
// (b) joints auto-inserted where a stretched tube exceeds its standard stick length
import * as THREE from "three";
import { effPorts, getDef } from "./catalog";
import type { PlacedComponent } from "./types";

export interface WeldJoint {
  id: string; // W1, W2, ...
  kind: "connection" | "length";
  od: number; // inches
  wall: number; // inches
  idia: number; // inner diameter, inches
  sizeLabel: string;
  process: string;
  detail: string;
  position: [number, number, number]; // world
  axis: [number, number, number]; // world tube axis (for 3D ring markers)
}

export function computeWelds(placed: PlacedComponent[]): WeldJoint[] {
  const joints: WeldJoint[] = [];
  const seenConn = new Set<string>();

  for (const p of placed) {
    const def = getDef(p.defId);
    if (!def) continue;
    const q = new THREE.Quaternion(...p.quaternion);
    const o = new THREE.Vector3(...p.position);

    // (a) length-overflow joints on stretched tubes
    if (def.stretchable && def.stdLen) {
      const len = p.lengthOverride ?? def.dims.len;
      const wall = def.dims.wall ?? 0.035;
      const od = def.dims.dia ?? 0.25;
      const nJoints = Math.floor((len - 1e-6) / def.stdLen);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
      for (let k = 1; k <= nJoints; k++) {
        const lx = -len / 2 + k * def.stdLen;
        const w = new THREE.Vector3(lx, 0, 0).applyQuaternion(q).add(o);
        joints.push({
          id: "",
          kind: "length",
          od,
          wall,
          idia: od - 2 * wall,
          sizeLabel: def.sizeLabel,
          process: "Orbital GTAW",
          detail: `${def.partNumber} run ${len.toFixed(2)} in > ${def.stdLen} in stick — joint ${k}`,
          position: [w.x, w.y, w.z],
          axis: [axis.x, axis.y, axis.z],
        });
      }
    }

    // (b) weld-to-weld connections
    const ports = effPorts(def, p.lengthOverride);
    for (const c of p.connections) {
      const key = [p.uid, c.otherUid].sort().join("|");
      if (seenConn.has(key)) continue;
      const port = ports.find((pt) => pt.id === c.portId);
      const other = placed.find((x) => x.uid === c.otherUid);
      const oDef = other ? getDef(other.defId) : undefined;
      if (!port || !other || !oDef) continue;
      const oPort = effPorts(oDef, other.lengthOverride).find(
        (pt) => pt.id === c.otherPortId,
      );
      if (!oPort || port.endType !== "weld" || oPort.endType !== "weld") continue;
      seenConn.add(key);
      const w = new THREE.Vector3(...port.position).applyQuaternion(q).add(o);
      const ax = new THREE.Vector3(...port.direction).applyQuaternion(q).normalize();
      const od = def.dims.dia ?? def.dims.bodyDia ?? 0.25;
      const wall = def.dims.wall ?? 0.035;
      joints.push({
        id: "",
        kind: "connection",
        od,
        wall,
        idia: od - 2 * wall,
        sizeLabel: def.sizeLabel,
        process: "Orbital GTAW",
        detail: `${def.partNumber} x ${oDef.partNumber} (${port.size} butt weld)`,
        position: [w.x, w.y, w.z],
        axis: [ax.x, ax.y, ax.z],
      });
    }
  }

  joints.forEach((j, i) => {
    j.id = `W${i + 1}`;
  });
  return joints;
}

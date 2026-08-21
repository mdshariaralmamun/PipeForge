// Shared run builder: turns 3D waypoints into straight tube segments with 90 deg
// elbows at direction changes. Fully 3D — Y is up — so runs can route
// horizontally and vertically. Used by freehand sketching (finishSketch) and
// by the AI chat agent's "route" action.
import * as THREE from "three";
import type { ComponentDef, PlacedComponent, Vec3 } from "./types";

export function buildRunParts(
  pts: Vec3[],
  tubeDef: ComponentDef,
  elbowDef: ComponentDef,
  mkUid: () => string,
): PlacedComponent[] {
  if (pts.length < 2) return [];
  const leg = elbowDef.dims.leg;
  const X = new THREE.Vector3(1, 0, 0);
  const n = pts.length;

  // Which interior points get an elbow (direction change ~90 deg)?
  const elbowAt = pts.map((_, i) => {
    if (i === 0 || i === n - 1) return false;
    const dIn = new THREE.Vector3(...pts[i])
      .sub(new THREE.Vector3(...pts[i - 1]))
      .normalize();
    const dOut = new THREE.Vector3(...pts[i + 1])
      .sub(new THREE.Vector3(...pts[i]))
      .normalize();
    return Math.abs(dIn.dot(dOut)) < 0.2;
  });

  const newParts: PlacedComponent[] = [];
  const link = (a: PlacedComponent, aPort: string, b: PlacedComponent, bPort: string) => {
    a.connections.push({ portId: aPort, otherUid: b.uid, otherPortId: bPort });
    b.connections.push({ portId: bPort, otherUid: a.uid, otherPortId: aPort });
  };

  let prev: PlacedComponent | null = null; // part whose free "p2" faces the next segment
  for (let i = 0; i < n - 1; i++) {
    const a = new THREE.Vector3(...pts[i]);
    const b = new THREE.Vector3(...pts[i + 1]);
    const dir = b.clone().sub(a).normalize();
    const startOff = i > 0 && elbowAt[i] ? leg : 0;
    const endOff = elbowAt[i + 1] ? leg : 0;
    const len = a.distanceTo(b) - startOff - endOff;
    if (len < 0.5) continue;
    const mid = a.clone().addScaledVector(dir, startOff + len / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(X, dir);
    const tube: PlacedComponent = {
      uid: mkUid(),
      defId: tubeDef.id,
      position: [mid.x, mid.y, mid.z],
      quaternion: [q.x, q.y, q.z, q.w],
      connections: [],
      lengthOverride: Math.min(36, len),
    };
    newParts.push(tube);

    if (i > 0 && prev) {
      if (elbowAt[i]) {
        // Corner: insert elbow. Local p1 = +X outward, p2 = +Y outward.
        const dIn = new THREE.Vector3(...pts[i])
          .sub(new THREE.Vector3(...pts[i - 1]))
          .normalize();
        const e1 = dIn.clone().negate();
        const e3 = new THREE.Vector3().crossVectors(e1, dir).normalize();
        const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
        const qe = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(e1, e2, e3),
        );
        const corner = new THREE.Vector3(...pts[i]);
        const elbow: PlacedComponent = {
          uid: mkUid(),
          defId: elbowDef.id,
          position: [corner.x, corner.y, corner.z],
          quaternion: [qe.x, qe.y, qe.z, qe.w],
          connections: [],
        };
        newParts.push(elbow);
        link(prev, "p2", elbow, "p1");
        link(elbow, "p2", tube, "p1");
      } else {
        link(prev, "p2", tube, "p1");
      }
    }
    prev = tube;
  }
  return newParts;
}

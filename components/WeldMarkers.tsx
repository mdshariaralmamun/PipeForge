"use client";

import * as THREE from "three";
import { useMemo } from "react";
import { useAssembly } from "@/lib/assembly";
import { computeWelds } from "@/lib/welds";

const weldMat = new THREE.MeshStandardMaterial({
  color: "#f97316",
  emissive: "#f97316",
  emissiveIntensity: 0.45,
  metalness: 0.3,
  roughness: 0.5,
});

// Orange rings marking orbital weld joints (weld connections + joints where a
// stretched tube exceeds its standard stick length).
export default function WeldMarkers() {
  const placed = useAssembly((s) => s.placed);
  const joints = useMemo(() => computeWelds(placed), [placed]);

  return (
    <>
      {joints.map((j) => {
        // Torus default axis is +Z; align it with the tube axis at the joint.
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(...j.axis).normalize(),
        );
        return (
          <mesh
            key={j.id}
            position={j.position}
            quaternion={[q.x, q.y, q.z, q.w]}
            material={weldMat}
          >
            <torusGeometry args={[j.od / 2 + 0.05, 0.022, 10, 32]} />
          </mesh>
        );
      })}
    </>
  );
}
